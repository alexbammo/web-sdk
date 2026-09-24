import { randomBytes } from 'node:crypto';
import type { LinkedInIdentity } from '../src/lib/types.js';

// "Sign In with LinkedIn using OpenID Connect" – the self-serve LinkedIn product.
// It grants name, photo, email and locale. Headline, about, experience and posts
// are NOT available to ordinary apps (they need partner-program access), which
// is why the UI asks the person to paste those in.

const AUTHORIZE_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';

const pendingStates = new Map<string, number>();
const sessions = new Map<string, { identity: LinkedInIdentity; createdAt: number }>();
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function linkedinConfigured(): boolean {
	return Boolean(
		process.env.LINKEDIN_CLIENT_ID &&
			process.env.LINKEDIN_CLIENT_SECRET &&
			process.env.LINKEDIN_REDIRECT_URI,
	);
}

export function authorizeUrl(): string {
	const state = randomBytes(16).toString('hex');
	pendingStates.set(state, Date.now());
	const params = new URLSearchParams({
		response_type: 'code',
		client_id: process.env.LINKEDIN_CLIENT_ID!,
		redirect_uri: process.env.LINKEDIN_REDIRECT_URI!,
		scope: 'openid profile email',
		state,
	});
	return `${AUTHORIZE_URL}?${params}`;
}

/** Exchanges the auth code, fetches the member's OIDC profile, returns a session id. */
export async function handleCallback(code: string, state: string): Promise<string> {
	const issued = pendingStates.get(state);
	pendingStates.delete(state);
	if (!issued || Date.now() - issued > 10 * 60 * 1000)
		throw new Error('Invalid or expired OAuth state');

	const tokenRes = await fetch(TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			redirect_uri: process.env.LINKEDIN_REDIRECT_URI!,
			client_id: process.env.LINKEDIN_CLIENT_ID!,
			client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
		}),
	});
	if (!tokenRes.ok) throw new Error(`LinkedIn token exchange failed (${tokenRes.status})`);
	const { access_token } = (await tokenRes.json()) as { access_token: string };

	const infoRes = await fetch(USERINFO_URL, {
		headers: { Authorization: `Bearer ${access_token}` },
	});
	if (!infoRes.ok) throw new Error(`LinkedIn userinfo failed (${infoRes.status})`);
	const info = (await infoRes.json()) as {
		name: string;
		given_name?: string;
		family_name?: string;
		picture?: string;
		email?: string;
		locale?: string | { language?: string; country?: string };
	};

	// The access token is used once and discarded; only the profile is kept.
	const sessionId = randomBytes(24).toString('hex');
	sessions.set(sessionId, {
		createdAt: Date.now(),
		identity: {
			name: info.name,
			givenName: info.given_name,
			familyName: info.family_name,
			picture: info.picture,
			email: info.email,
			locale: typeof info.locale === 'string' ? info.locale : info.locale?.language,
		},
	});
	return sessionId;
}

export function getIdentity(sessionId: string | undefined): LinkedInIdentity | null {
	if (!sessionId) return null;
	const s = sessions.get(sessionId);
	if (!s) return null;
	if (Date.now() - s.createdAt > SESSION_TTL_MS) {
		sessions.delete(sessionId);
		return null;
	}
	return s.identity;
}

export function endSession(sessionId: string | undefined) {
	if (sessionId) sessions.delete(sessionId);
}
