import type {
	AvatarJob,
	LinkedInIdentity,
	ProfileInput,
	SceneDirection,
	ServerConfig,
} from './types';
import { heuristicDirection } from './heuristics';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(path, {
		...init,
		headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
		credentials: 'same-origin',
	});
	if (!res.ok) {
		const body = (await res.json().catch(() => ({}))) as { error?: string };
		throw new Error(body.error ?? `${path} failed (${res.status})`);
	}
	return res.json() as Promise<T>;
}

/** The API server is optional; without it the app runs fully local. */
export async function getConfig(): Promise<ServerConfig | null> {
	try {
		return await request<ServerConfig>('/api/config');
	} catch {
		return null;
	}
}

export async function analyze(
	input: ProfileInput,
	serverAvailable: boolean,
): Promise<SceneDirection> {
	if (!serverAvailable) return heuristicDirection(input);
	return request<SceneDirection>('/api/analyze', { method: 'POST', body: JSON.stringify(input) });
}

export async function me(): Promise<LinkedInIdentity | null> {
	try {
		return await request<LinkedInIdentity>('/api/me');
	} catch {
		return null;
	}
}

export async function logout() {
	await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
}

export async function generateAvatar(
	photo: string,
	onProgress: (job: AvatarJob) => void,
): Promise<AvatarJob> {
	let job = await request<AvatarJob>('/api/avatar', {
		method: 'POST',
		body: JSON.stringify({ photo }),
	});
	onProgress(job);
	while (job.status === 'queued' || job.status === 'running') {
		await new Promise((r) => setTimeout(r, 4000));
		job = await request<AvatarJob>(`/api/avatar/${job.id}`);
		onProgress(job);
	}
	if (job.status === 'failed') throw new Error(job.error ?? 'Avatar generation failed');
	return job;
}
