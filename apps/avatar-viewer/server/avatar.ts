import { randomUUID } from 'node:crypto';
import {
	expectOk,
	falConfigured,
	falResult,
	falSubmit,
	firstImage,
	PHOTO_STYLE,
	type FalRequest,
} from './fal.js';
import type { AvatarJob, AvatarRequest } from '../src/lib/types.js';

// Photo -> full 3D person, in three generative stages:
//
//   1. reference  A headshot has no body, so an identity-preserving image model
//                 (FLUX Kontext) re-photographs the same person full-length,
//                 transposing their exact clothing and finishing it in a
//                 matching business style. Soft studio light, plain backdrop.
//   2. views      The same model photographs that reference from the side and
//                 from behind, so the 3D model doesn't have to invent them.
//   3. mesh       A multi-view image-to-3D model (Hunyuan3D multi-view or Meshy
//                 multi-image) builds a textured GLB. Falls back to single-view.
//
// Stages 1–2 are skipped when the person uploads a full-length photo themselves.
// Jobs live in memory; this is a single-process prototype server.

type MeshRemote =
	| { provider: 'meshy'; id: string; multi: boolean }
	| { provider: 'fal'; req: FalRequest };

interface InternalJob extends AvatarJob {
	request?: AvatarRequest;
	pending?: FalRequest;
	pendingViews?: { left: FalRequest; back: FalRequest };
	views?: { front: string; left?: string; back?: string };
	mesh?: MeshRemote;
	remoteModelUrl?: string;
	createdAt: number;
}

const jobs = new Map<string, InternalJob>();
const JOB_TTL_MS = 60 * 60 * 1000;

const referenceModel = () => process.env.FAL_REFERENCE_MODEL || 'fal-ai/flux-pro/kontext';
const falMeshModel = () => process.env.FAL_MODEL || 'fal-ai/hunyuan3d/v2';
const falMultiViewMeshModel = () =>
	process.env.FAL_MULTIVIEW_MODEL || 'fal-ai/hunyuan3d/v2/multi-view';

/** Which service builds the mesh. Meshy is preferred when both keys are set. */
function meshProvider(): 'meshy' | 'fal' | null {
	if (process.env.MESHY_API_KEY) return 'meshy';
	if (falConfigured()) return 'fal';
	return null;
}

export function avatarCapabilities() {
	return {
		mesh: meshProvider(),
		// Re-photographing a headshot full-length (and the finishing pass) needs fal.
		fullBodyFromHeadshot: falConfigured(),
	};
}

function publicView(job: InternalJob): AvatarJob {
	const { id, status, stage, progress, error, referenceUrl, modelUrl, meshProvider } = job;
	return { id, status, stage, progress, error, referenceUrl, modelUrl, meshProvider };
}

// ---------- stage 1: full-length reference ----------

function referencePrompt(req: AvatarRequest): string {
	const outfit = req.outfit?.trim();
	return [
		'Full-length professional portrait photograph of this exact person, head to toe with their feet visible,',
		'standing upright and relaxed, facing the camera, arms hanging naturally with the hands slightly away from the hips.',
		'Transpose their clothing exactly from the photo: the same garments, fabric, colours, pattern, collar, buttons and fit.',
		outfit
			? `Their full outfit: ${outfit}.`
			: 'Complete anything the photo does not show (trousers or skirt, belt, shoes) in a matching, business-appropriate style.',
		'Keep their face, expression, hairstyle, hair colour, skin tone, glasses, accessories and build exactly the same.',
		'Plain seamless light-grey studio backdrop, even soft light from the front, no harsh shadows.',
		PHOTO_STYLE,
	].join(' ');
}

const VIEW_PROMPTS = {
	left: 'The exact same person, outfit, pose, lighting and plain backdrop, photographed from their left side as a true 90-degree side profile, full length, head to toe.',
	back: 'The exact same person, outfit, pose, lighting and plain backdrop, photographed from directly behind, full length, head to toe, showing the back of their head, hair and clothing.',
};

function kontext(prompt: string, imageUrl: string) {
	return falSubmit(referenceModel(), {
		prompt,
		image_url: imageUrl,
		aspect_ratio: '2:3',
		output_format: 'png',
	});
}

async function pollReference(job: InternalJob) {
	const result = await falResult<{ images?: { url: string }[] }>(job.pending!);
	if (!result) {
		job.progress = Math.min(0.2, job.progress + 0.02);
		return;
	}
	const front = firstImage(result, 'The full-length reference');
	job.referenceUrl = front;
	job.views = { front };
	job.stage = 'views';
	job.progress = 0.22;
	// Side and back views in parallel, both conditioned on the front reference.
	const [left, back] = await Promise.all([
		kontext(`${VIEW_PROMPTS.left} ${PHOTO_STYLE}`, front),
		kontext(`${VIEW_PROMPTS.back} ${PHOTO_STYLE}`, front),
	]);
	job.pendingViews = { left, back };
}

// ---------- stage 2: extra views ----------

async function pollViews(job: InternalJob) {
	const { left, back } = job.pendingViews!;
	const [l, b] = await Promise.all([
		job.views!.left !== undefined
			? null
			: falResult<{ images?: { url: string }[] }>(left).catch(() => ({ images: [] })),
		job.views!.back !== undefined
			? null
			: falResult<{ images?: { url: string }[] }>(back).catch(() => ({ images: [] })),
	]);
	// A failed side view isn't fatal: the mesh can still be built from the front alone.
	if (l) job.views!.left = l.images?.[0]?.url ?? '';
	if (b) job.views!.back = b.images?.[0]?.url ?? '';
	if (job.views!.left === undefined || job.views!.back === undefined) {
		job.progress = Math.min(0.4, job.progress + 0.02);
		return;
	}
	await startMesh(job);
}

// ---------- stage 3: mesh ----------

const MESHY = 'https://api.meshy.ai/openapi/v1';

async function meshyCreate(path: string, body: Record<string, unknown>) {
	const res = await fetch(`${MESHY}/${path}`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${process.env.MESHY_API_KEY}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(body),
	});
	return ((await expectOk(res, `Meshy ${path}`)) as { result: string }).result;
}

async function startMesh(job: InternalJob) {
	job.stage = 'mesh';
	job.progress = Math.max(job.progress, 0.42);
	const provider = meshProvider();
	if (!provider) throw new Error('No image-to-3D provider configured');
	job.meshProvider = provider;
	const { front, left, back } = job.views!;
	const extra = [left, back].filter((u): u is string => Boolean(u));

	if (provider === 'meshy') {
		// Baked (non-PBR) texture: skin and cloth read better than generated metal/rough maps.
		if (extra.length) {
			try {
				const id = await meshyCreate('multi-image-to-3d', {
					image_urls: [front, ...extra],
					enable_pbr: false,
				});
				job.mesh = { provider: 'meshy', id, multi: true };
				return;
			} catch (err) {
				console.warn('[avatar] Meshy multi-image failed, using the front view only:', err);
			}
		}
		const id = await meshyCreate('image-to-3d', { image_url: front, enable_pbr: false });
		job.mesh = { provider: 'meshy', id, multi: false };
		return;
	}

	if (left && back) {
		try {
			const req = await falSubmit(falMultiViewMeshModel(), {
				front_image_url: front,
				left_image_url: left,
				back_image_url: back,
				textured_mesh: true,
			});
			job.mesh = { provider: 'fal', req };
			return;
		} catch (err) {
			console.warn('[avatar] multi-view mesh failed, using the front view only:', err);
		}
	}
	// Hunyuan3D takes input_image_url, TRELLIS takes image_url; each ignores the other.
	const req = await falSubmit(falMeshModel(), {
		input_image_url: front,
		image_url: front,
		textured_mesh: true,
	});
	job.mesh = { provider: 'fal', req };
}

async function pollMesh(job: InternalJob) {
	const mesh = job.mesh!;
	if (mesh.provider === 'meshy') {
		const path = mesh.multi ? 'multi-image-to-3d' : 'image-to-3d';
		const res = await fetch(`${MESHY}/${path}/${mesh.id}`, {
			headers: { Authorization: `Bearer ${process.env.MESHY_API_KEY}` },
		});
		const data = (await expectOk(res, 'Meshy status')) as {
			status: string;
			progress?: number;
			model_urls?: { glb?: string };
			task_error?: { message?: string };
		};
		job.progress = 0.42 + ((data.progress ?? 0) / 100) * 0.58;
		if (data.status === 'SUCCEEDED' && data.model_urls?.glb)
			return succeed(job, data.model_urls.glb);
		if (data.status === 'FAILED' || data.status === 'CANCELED') {
			throw new Error(data.task_error?.message || `Meshy task ${data.status.toLowerCase()}`);
		}
		return;
	}
	const result = await falResult<{ model_mesh?: { url?: string }; model_glb?: { url?: string } }>(
		mesh.req,
	);
	if (!result) {
		// fal doesn't report progress; creep towards 95% so the bar moves.
		job.progress = Math.min(0.95, job.progress + 0.02);
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
		request: req,
		createdAt: Date.now(),
	};
	jobs.set(job.id, job);
	try {
		if (req.fullBodyPhoto) {
			job.views = { front: req.photo };
			await startMesh(job);
		} else {
			job.pending = await kontext(referencePrompt(req), req.photo);
		}
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
			else if (job.stage === 'views') await pollViews(job);
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
