import { randomUUID } from 'node:crypto';
import type { AvatarJob } from '../src/lib/types.js';

// Image -> textured 3D mesh (GLB) via a hosted model. Jobs live in memory;
// this is a single-process prototype server, not a queue.

interface InternalJob extends AvatarJob {
	remoteId?: string;
	statusUrl?: string;
	responseUrl?: string;
	remoteModelUrl?: string;
	createdAt: number;
}

const jobs = new Map<string, InternalJob>();
const JOB_TTL_MS = 60 * 60 * 1000;

export function avatarProvider(): 'meshy' | 'fal' | null {
	if (process.env.MESHY_API_KEY) return 'meshy';
	if (process.env.FAL_KEY) return 'fal';
	return null;
}

function publicView(job: InternalJob): AvatarJob {
	const { id, status, progress, provider, error, modelUrl } = job;
	return { id, status, progress, provider, error, modelUrl };
}

async function expectOk(res: Response, what: string): Promise<unknown> {
	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new Error(`${what} failed (${res.status}): ${body.slice(0, 300)}`);
	}
	return res.json();
}

function markSucceeded(job: InternalJob, remoteModelUrl: string) {
	job.remoteModelUrl = remoteModelUrl;
	job.modelUrl = `/api/avatar/${job.id}/model.glb`;
	job.status = 'succeeded';
	job.progress = 1;
}

// ---------- Meshy ----------

const MESHY_BASE = 'https://api.meshy.ai/openapi/v1/image-to-3d';

async function meshyStart(job: InternalJob, imageDataUrl: string) {
	const res = await fetch(MESHY_BASE, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${process.env.MESHY_API_KEY}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ image_url: imageDataUrl, enable_pbr: true }),
	});
	const data = (await expectOk(res, 'Meshy create')) as { result: string };
	job.remoteId = data.result;
}

async function meshyPoll(job: InternalJob) {
	const res = await fetch(`${MESHY_BASE}/${job.remoteId}`, {
		headers: { Authorization: `Bearer ${process.env.MESHY_API_KEY}` },
	});
	const data = (await expectOk(res, 'Meshy status')) as {
		status: string;
		progress?: number;
		model_urls?: { glb?: string };
		task_error?: { message?: string };
	};
	job.progress = (data.progress ?? 0) / 100;
	if (data.status === 'SUCCEEDED' && data.model_urls?.glb) {
		markSucceeded(job, data.model_urls.glb);
	} else if (data.status === 'FAILED' || data.status === 'CANCELED') {
		job.status = 'failed';
		job.error = data.task_error?.message || `Meshy task ${data.status.toLowerCase()}`;
	} else {
		job.status = 'running';
	}
}

// ---------- fal.ai queue (Hunyuan3D / TRELLIS) ----------

function falModel() {
	return process.env.FAL_MODEL || 'fal-ai/hunyuan3d/v2';
}

async function falStart(job: InternalJob, imageDataUrl: string) {
	const res = await fetch(`https://queue.fal.run/${falModel()}`, {
		method: 'POST',
		headers: { Authorization: `Key ${process.env.FAL_KEY}`, 'Content-Type': 'application/json' },
		// Hunyuan3D takes input_image_url, TRELLIS takes image_url; each ignores the other.
		body: JSON.stringify({
			input_image_url: imageDataUrl,
			image_url: imageDataUrl,
			textured_mesh: true,
		}),
	});
	const data = (await expectOk(res, 'fal submit')) as {
		request_id: string;
		status_url: string;
		response_url: string;
	};
	job.remoteId = data.request_id;
	job.statusUrl = data.status_url;
	job.responseUrl = data.response_url;
}

async function falPoll(job: InternalJob) {
	const headers = { Authorization: `Key ${process.env.FAL_KEY}` };
	const status = (await expectOk(await fetch(job.statusUrl!, { headers }), 'fal status')) as {
		status: string;
		queue_position?: number;
	};
	if (status.status === 'COMPLETED') {
		const result = (await expectOk(await fetch(job.responseUrl!, { headers }), 'fal result')) as {
			model_mesh?: { url?: string };
			model_glb?: { url?: string };
		};
		const url = result.model_mesh?.url ?? result.model_glb?.url;
		if (!url) {
			job.status = 'failed';
			job.error = 'fal returned no mesh';
			return;
		}
		markSucceeded(job, url);
	} else {
		job.status = 'running';
		// fal doesn't report progress; creep towards 90% so the bar moves.
		job.progress = Math.min(0.9, job.progress + 0.04);
	}
}

// ---------- public API ----------

export async function startAvatarJob(imageDataUrl: string): Promise<AvatarJob> {
	const provider = avatarProvider();
	if (!provider) throw new Error('No image-to-3D provider configured');
	for (const [id, j] of jobs) if (Date.now() - j.createdAt > JOB_TTL_MS) jobs.delete(id);

	const job: InternalJob = {
		id: randomUUID(),
		status: 'queued',
		progress: 0,
		provider,
		createdAt: Date.now(),
	};
	jobs.set(job.id, job);
	if (provider === 'meshy') await meshyStart(job, imageDataUrl);
	else await falStart(job, imageDataUrl);
	return publicView(job);
}

export async function pollAvatarJob(id: string): Promise<AvatarJob | null> {
	const job = jobs.get(id);
	if (!job) return null;
	if (job.status === 'queued' || job.status === 'running') {
		try {
			if (job.provider === 'meshy') await meshyPoll(job);
			else await falPoll(job);
		} catch (err) {
			job.status = 'failed';
			job.error = err instanceof Error ? err.message : String(err);
		}
	}
	return publicView(job);
}

/** Streams the finished GLB through this server so the browser never needs provider CORS. */
export async function fetchAvatarModel(id: string): Promise<Response | null> {
	const job = jobs.get(id);
	if (!job?.remoteModelUrl) return null;
	return fetch(job.remoteModelUrl);
}
