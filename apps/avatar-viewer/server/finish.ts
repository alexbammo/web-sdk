import { randomUUID } from 'node:crypto';
import { falResult, falSubmit, firstImage, PHOTO_STYLE, type FalRequest } from './fal.js';
import type { FinishJob, FinishRequest } from '../src/lib/types.js';

// "Photographic finish" for exported stills. A real-time mesh of a person is
// never going to pass for a photograph, but it gets composition, pose, set and
// light right. So the final LinkedIn image is the 3D render re-photographed by
// FLUX Kontext, with the person's original photo supplied as the identity
// reference so the face is theirs, not the mesh's.

interface InternalFinish extends FinishJob {
	pending?: FalRequest;
	remoteImageUrl?: string;
	createdAt: number;
}

const jobs = new Map<string, InternalFinish>();
const TTL_MS = 60 * 60 * 1000;

// Multi-image Kontext sees both the render and the original photo.
const multiModel = () => process.env.FAL_FINISH_MODEL || 'fal-ai/flux-pro/kontext/max/multi';
const singleModel = () => process.env.FAL_REFERENCE_MODEL || 'fal-ai/flux-pro/kontext';

const MULTI_PROMPT = [
	'Turn the first image into a real professional photograph.',
	'The first image is a 3D render of the person shown in the second image.',
	'Keep the first image’s composition, framing, camera angle, pose, clothing, setting, props and direction of light exactly.',
	'Make the person a real human with the face, features, expression, hair and skin tone of the person in the second image, and render their clothing as real fabric with natural folds.',
	'Soft, flattering light on the face; the background gently out of focus.',
	PHOTO_STYLE,
].join(' ');

const SINGLE_PROMPT = [
	'Turn this 3D render into a real professional photograph.',
	'Keep the composition, framing, camera angle, pose, the person’s face and features, clothing, setting, props and direction of light exactly;',
	'make the person look like a real photographed human with natural skin, hair and fabric.',
	'Soft, flattering light on the face; the background gently out of focus.',
	PHOTO_STYLE,
].join(' ');

export async function startFinish(req: FinishRequest): Promise<FinishJob> {
	for (const [id, j] of jobs) if (Date.now() - j.createdAt > TTL_MS) jobs.delete(id);
	const common = { aspect_ratio: req.aspect, output_format: 'jpeg' };
	let pending: FalRequest;
	try {
		pending = await falSubmit(multiModel(), {
			...common,
			prompt: MULTI_PROMPT,
			image_urls: [req.render, req.photo],
		});
	} catch (err) {
		console.warn('[finish] multi-image model unavailable, finishing from the render alone:', err);
		pending = await falSubmit(singleModel(), {
			...common,
			prompt: SINGLE_PROMPT,
			image_url: req.render,
		});
	}
	const job: InternalFinish = {
		id: randomUUID(),
		status: 'running',
		pending,
		createdAt: Date.now(),
	};
	jobs.set(job.id, job);
	return { id: job.id, status: job.status };
}

export async function pollFinish(id: string): Promise<FinishJob | null> {
	const job = jobs.get(id);
	if (!job) return null;
	if (job.status === 'running') {
		try {
			const result = await falResult<{ images?: { url: string }[] }>(job.pending!);
			if (result) {
				job.remoteImageUrl = firstImage(result, 'The photographic finish');
				job.imageUrl = `/api/finish/${job.id}/image.jpg`;
				job.status = 'succeeded';
			}
		} catch (err) {
			job.status = 'failed';
			job.error = err instanceof Error ? err.message : String(err);
		}
	}
	const { status, imageUrl, error } = job;
	return { id, status, imageUrl, error };
}

export async function fetchFinishImage(id: string): Promise<Response | null> {
	const job = jobs.get(id);
	if (!job?.remoteImageUrl) return null;
	return fetch(job.remoteImageUrl);
}
