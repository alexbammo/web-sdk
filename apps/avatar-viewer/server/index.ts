import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeProfile, claudeConfigured } from './analyze.js';
import { avatarCapabilities, fetchAvatarModel, pollAvatarJob, startAvatarJob } from './avatar.js';
import {
	authorizeUrl,
	endSession,
	getIdentity,
	handleCallback,
	linkedinConfigured,
} from './linkedin.js';
import type { AvatarRequest, ProfileInput, ServerConfig } from '../src/lib/types.js';

try {
	process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
} catch {
	// no .env – fine, everything is optional
}

const PORT = Number(process.env.API_PORT ?? 3011);
const APP_ORIGIN = process.env.APP_ORIGIN ?? `http://localhost:3010`;
const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const MAX_BODY = 12 * 1024 * 1024;
const SESSION_COOKIE = 'pv_session';

function json(res: ServerResponse, status: number, body: unknown) {
	res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
	res.end(JSON.stringify(body));
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of req) {
		size += (chunk as Buffer).length;
		if (size > MAX_BODY) throw new Error('Request body too large');
		chunks.push(chunk as Buffer);
	}
	return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
}

function cookie(req: IncomingMessage, name: string): string | undefined {
	const header = req.headers.cookie ?? '';
	for (const part of header.split(';')) {
		const [k, ...v] = part.trim().split('=');
		if (k === name) return decodeURIComponent(v.join('='));
	}
	return undefined;
}

const MIME: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript',
	'.css': 'text/css',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.wasm': 'application/wasm',
	'.json': 'application/json',
};

async function serveStatic(pathname: string, res: ServerResponse) {
	const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
	let file = join(DIST, safe);
	if (!file.startsWith(DIST)) return json(res, 404, { error: 'Not found' });
	try {
		if (!(await stat(file)).isFile()) throw new Error();
	} catch {
		file = join(DIST, 'index.html');
	}
	try {
		const body = await readFile(file);
		res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
		res.end(body);
	} catch {
		json(res, 404, { error: 'Not found – run `pnpm build` or use `pnpm dev`' });
	}
}

async function route(req: IncomingMessage, res: ServerResponse) {
	const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
	const { pathname } = url;
	const method = req.method ?? 'GET';

	if (pathname === '/api/config' && method === 'GET') {
		const config: ServerConfig = {
			claude: claudeConfigured(),
			linkedin: linkedinConfigured(),
			avatar: avatarCapabilities(),
		};
		return json(res, 200, config);
	}

	if (pathname === '/api/analyze' && method === 'POST') {
		const input = await readJson<ProfileInput>(req);
		return json(res, 200, await analyzeProfile(input));
	}

	if (pathname === '/api/avatar' && method === 'POST') {
		const body = await readJson<AvatarRequest>(req);
		if (!/^data:image\/(jpeg|png|webp);base64,/.test(body.photo ?? '')) {
			return json(res, 400, { error: 'photo must be a JPEG, PNG or WebP data URL' });
		}
		return json(res, 202, await startAvatarJob(body));
	}

	const jobMatch = /^\/api\/avatar\/([0-9a-f-]{36})(\/model\.glb)?$/.exec(pathname);
	if (jobMatch && method === 'GET') {
		if (jobMatch[2]) {
			const upstream = await fetchAvatarModel(jobMatch[1]);
			if (!upstream?.ok || !upstream.body) return json(res, 404, { error: 'Model not ready' });
			res.writeHead(200, {
				'Content-Type': 'model/gltf-binary',
				'Cache-Control': 'private, max-age=3600',
			});
			res.end(Buffer.from(await upstream.arrayBuffer()));
			return;
		}
		const job = await pollAvatarJob(jobMatch[1]);
		return job ? json(res, 200, job) : json(res, 404, { error: 'Unknown job' });
	}

	if (pathname === '/api/auth/linkedin' && method === 'GET') {
		if (!linkedinConfigured())
			return json(res, 501, { error: 'LinkedIn sign-in is not configured' });
		res.writeHead(302, { Location: authorizeUrl() });
		return res.end();
	}

	if (pathname === '/api/auth/linkedin/callback' && method === 'GET') {
		const code = url.searchParams.get('code');
		const state = url.searchParams.get('state');
		if (!code || !state) {
			res.writeHead(302, { Location: `${APP_ORIGIN}/?linkedin=denied` });
			return res.end();
		}
		const sessionId = await handleCallback(code, state);
		const secure = APP_ORIGIN.startsWith('https:') ? '; Secure' : '';
		res.writeHead(302, {
			'Set-Cookie': `${SESSION_COOKIE}=${sessionId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200${secure}`,
			Location: `${APP_ORIGIN}/?linkedin=ok`,
		});
		return res.end();
	}

	if (pathname === '/api/me' && method === 'GET') {
		const identity = getIdentity(cookie(req, SESSION_COOKIE));
		return identity ? json(res, 200, identity) : json(res, 401, { error: 'Not signed in' });
	}

	if (pathname === '/api/me/photo' && method === 'GET') {
		// Only proxies the signed-in member's own LinkedIn photo, so it can be drawn to a canvas.
		const identity = getIdentity(cookie(req, SESSION_COOKIE));
		if (!identity?.picture) return json(res, 404, { error: 'No photo' });
		const upstream = await fetch(identity.picture);
		if (!upstream.ok) return json(res, 502, { error: 'Could not fetch LinkedIn photo' });
		res.writeHead(200, {
			'Content-Type': upstream.headers.get('content-type') ?? 'image/jpeg',
			'Cache-Control': 'private, max-age=600',
		});
		res.end(Buffer.from(await upstream.arrayBuffer()));
		return;
	}

	if (pathname === '/api/logout' && method === 'POST') {
		endSession(cookie(req, SESSION_COOKIE));
		res.writeHead(204, { 'Set-Cookie': `${SESSION_COOKIE}=; Path=/; Max-Age=0` });
		return res.end();
	}

	if (pathname.startsWith('/api/')) return json(res, 404, { error: 'Not found' });
	return serveStatic(pathname, res);
}

createServer((req, res) => {
	route(req, res).catch((err: unknown) => {
		console.error(err);
		if (!res.headersSent)
			json(res, 500, { error: err instanceof Error ? err.message : 'Server error' });
		else res.end();
	});
}).listen(PORT, () => {
	console.log(`[api] http://localhost:${PORT}`);
	console.log(
		`[api] claude=${claudeConfigured()} linkedin=${linkedinConfigured()} avatar=${JSON.stringify(avatarCapabilities())}`,
	);
});
