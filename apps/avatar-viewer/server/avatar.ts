import { randomUUID } from 'node:crypto';
import type { AvatarJob, AvatarRequest } from '../src/lib/types.js';

// Photo -> full 3D person, in two generative stages:
//
//   1. reference  A headshot has no body, so an identity-preserving image
//                 model (FLUX Kontext) re-draws the same person full-length,
//                 in a neutral standing pose, flat studio light, plain
//                 background – the input image-to-3D models work best from.
//   2. mesh       An image-to-3D model (Meshy, or Hunyuan3D / TRELLIS on fal)
//                 turns that reference into a textured GLB.
//
// Stage 1 is skipped when the person uploads a full-length photo themselves.
// Jobs live in memory; this is a single-process prototype server.

interface Remote {
	provider: 'fal' | 'meshy';
	id: string;
	statusUrl?: string;
	responseUrl?: string;
}

interface InternalJob extends AvatarJob {
	remote?: Remote;
	remoteModelUrl?: string;
	createdAt: number;
}

const jobs = new Map<string, InternalJob>();
const JOB_TTL_MS = 60 * 60 * 1000;

const referenceModel = () => process.env.FAL_REFERENCE_MODEL || 'fal-ai/flux-pro/kontext';
const falMeshModel = () => process.env.FAL_MODEL || 'fal-ai/hunyuan3d/v2';

/** Which service builds the mesh. Meshy is preferred when both keys are set. */
function meshProvider(): 'meshy' | 'fal' | null {
	if (process.env.MESHY_API_KEY) return 'meshy';
	if (process.env.FAL_KEY) return 'fal';
	return null;
}

export function avatarCapabilities() {
	return {
		mesh: meshProvider(),
		// Re-drawing a headshot as a full-length photo needs fal (FLUX Kontext).
		fullBodyFromHeadshot: Boolean(process.env.FAL_KEY),
	};
}

function publicView(job: InternalJob): AvatarJob {
	const { id, status, stage, progress, error, referenceUrl, modelUrl, meshProvider } = job;
	return { id, status, stage, progress, error, referenceUrl, modelUrl, meshProvider };
}

async function expectOk(res: Response, what: string): Promise<unknown> {
	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new Error(`${what} failed (${res.status}): ${body.slice(0, 300)}`);
	}
	return res.json();
}

// ---------- fal queue ----------

const falHeaders = () => ({
	Authorization: `Key ${process.env.FAL_KEY}`,
	'Content-Type': 'application/json',
});

async function falSubmit(model: string, input: Record<string, unknown>): Promise<Remote> {
	const res = await fetch(`https://queue.fal.run/${model}`, {
		method: 'POST',
		headers: falHeaders(),
		body: JSON.stringify(input),
	});
	const data = (await expectOk(res, `fal ${model}`)) as {
		request_id: string;
		status_url: string;
		response_url: string;
	};
	return {
		provider: 'fal',
		id: data.request_id,
		statusUrl: data.status_url,
		responseUrl: data.response_url,
	};
}

/** Returns the result payload once complete, or null while still running. */
async function falResult<T>(remote: Remote): Promise<T | null> {
	const statusRes = await fetch(remote.statusUrl!, { headers: falHeaders() });
	const status = (await expectOk(statusRes, 'fal status')) as { status: string };
	if (status.status !== 'COMPLETED') return null;
	return (await expectOk(
		await fetch(remote.responseUrl!, { headers: falHeaders() }),
		'fal result',
	)) as T;
}

// ---------- stage 1: full-body reference ----------

function referencePrompt(req: AvatarRequest): string {
	const outfit =
		req.outfit?.trim() || 'the same clothes they are wearing in the photo, completed naturally';
	return [
		'Full-length photograph of this exact person, head to toe, feet fully visible.',
		`They are wearing ${outfit}, with suitable shoes.`,
		'Relaxed natural standing pose, facing the camera straight on, arms slightly away from the body, hands open and relaxed.',
		'Keep their face, facial features, hairstyle, hair colour, skin tone, glasses and build exactly the same.',
		'Plain seamless light-grey studio background, soft even frontal lighting, no strong shadows, sharp focus, photorealistic.',
	].join(' ');
}

async function startReference(job: InternalJob, req: AvatarRequest) {
	job.stage = 'reference';
	job.remote = await falSubmit(referenceModel(), {
		prompt: referencePrompt(req),
		image_url: req.photo,
		aspect_ratio: '2:3',
		output_format: 'png',
	});
}

async function pollReference(job: InternalJob) {
	const result = await falResult<{ images?: { url: string }[] }>(job.remote!);
	if (!result) {
		job.progress = Math.min(0.3, job.progress + 0.03);
		return;
	}
	const url = result.images?.[0]?.url;
	if (!url) throw new Error('The image model returned no full-body reference');
	job.referenceUrl = url;
	await startMesh(job, url);
}

// ---------- stage 2: mesh ----------

const MESHY_BASE = 'https://api.meshy.ai/openapi/v1/image-to-3d';

async function startMesh(job: InternalJob, imageUrl: string) {
	job.stage = 'mesh';
	job.progress = Math.max(job.progress, 0.35);
	const provider = meshProvider();
	if (!provider) throw new Error('No image-to-3D provider configured');
	job.meshProvider = provider;
	if (provider === 'meshy') {
		const res = await fetch(MESHY_BASE, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${process.env.MESHY_API_KEY}`,
				'Content-Type': 'application/json',
			},
			// Baked (non-PBR) texture: skin and cloth read better than generated metal/rough maps.
			body: JSON.stringify({ image_url: imageUrl, enable_pbr: false }),
		});
		const data = (await expectOk(res, 'Meshy create')) as { result: string };
		job.remote = { provider: 'meshy', id: data.result };
	} else {
		// Hunyuan3D takes input_image_url, TRELLIS takes image_url; each ignores the other.
		job.remote = await falSubmit(falMeshModel(), {
			input_image_url: imageUrl,
			image_url: imageUrl,
			textured_mesh: true,
		});
	}
}

async function pollMesh(job: InternalJob) {
	const remote = job.remote!;
	if (remote.provider === 'meshy') {
		const res = await fetch(`${MESHY_BASE}/${remote.id}`, {
			headers: { Authorization: `Bearer ${process.env.MESHY_API_KEY}` },
		});
		const data = (await expectOk(res, 'Meshy status')) as {
			status: string;
			progress?: number;
			model_urls?: { glb?: string };
			task_error?: { message?: string };
		};
		job.progress = 0.35 + ((data.progress ?? 0) / 100) * 0.65;
		if (data.status === 'SUCCEEDED' && data.model_urls?.glb)
			return succeed(job, data.model_urls.glb);
		if (data.status === 'FAILED' || data.status === 'CANCELED') {
			throw new Error(data.task_error?.message || `Meshy task ${data.status.toLowerCase()}`);
		}
		return;
	}
	const result = await falResult<{ model_mesh?: { url?: string }; model_glb?: { url?: string } }>(
		remote,
	);
	if (!result) {
		// fal doesn't report progress; creep towards 95% so the bar moves.
		job.progress = Math.min(0.95, job.progress + 0.03);
		return;
	}
	const url = result.model_mesh?.url ?? result.model_glb?.url;
	if (!url) throw new Error('The 3D model returned no mesh');
	succeed(job, url);
}

function succeed(job: InternalJob, remoteModelUrl: string) {
	job.remoteModelUrl = remoteModelUrl;
	job.modelUrl = `/api/avatar/${job.id}/model.glb`;
	job.status = 'succeeded';
	job.progress = 1;
}

// ---------- public API ----------

export async function startAvatarJob(req: AvatarRequest): Promise<AvatarJob> {
	const caps = avatarCapabilities();
	if (!caps.mesh)
		throw new Error('No image-to-3D provider configured (set FAL_KEY or MESHY_API_KEY)');
	if (!req.fullBodyPhoto && !caps.fullBodyFromHeadshot) {
		throw new Error(
			'Recreating a full body from a headshot needs FAL_KEY (FLUX Kontext). Add it, or upload a full-length photo.',
		);
	}
	for (const [id, j] of jobs) if (Date.now() - j.createdAt > JOB_TTL_MS) jobs.delete(id);

	const job: InternalJob = {
		id: randomUUID(),
		status: 'running',
		stage: 'reference',
		progress: 0.02,
		createdAt: Date.now(),
	};
	jobs.set(job.id, job);
	try {
		if (req.fullBodyPhoto) await startMesh(job, req.photo);
		else await startReference(job, req);
	} catch (err) {
		jobs.delete(job.id);
		throw err;
	}
	return publicView(job);
}

export async function pollAvatarJob(id: string): Promise<AvatarJob | null> {
	const job = jobs.get(id);
	if (!job) return null;
	if (job.status === 'running') {
		try {
			if (job.stage === 'reference') await pollReference(job);
			else await pollMesh(job);
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
