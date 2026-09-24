// Minimal client for fal.ai's queue API (submit, poll status, fetch result).

export interface FalRequest {
	id: string;
	statusUrl: string;
	responseUrl: string;
}

export function falConfigured(): boolean {
	return Boolean(process.env.FAL_KEY);
}

const headers = () => ({
	Authorization: `Key ${process.env.FAL_KEY}`,
	'Content-Type': 'application/json',
});

export async function expectOk(res: Response, what: string): Promise<unknown> {
	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new Error(`${what} failed (${res.status}): ${body.slice(0, 300)}`);
	}
	return res.json();
}

export async function falSubmit(
	model: string,
	input: Record<string, unknown>,
): Promise<FalRequest> {
	const res = await fetch(`https://queue.fal.run/${model}`, {
		method: 'POST',
		headers: headers(),
		body: JSON.stringify(input),
	});
	const data = (await expectOk(res, `fal ${model}`)) as {
		request_id: string;
		status_url: string;
		response_url: string;
	};
	return { id: data.request_id, statusUrl: data.status_url, responseUrl: data.response_url };
}

/** Returns the result payload once complete, or null while still running. */
export async function falResult<T>(req: FalRequest): Promise<T | null> {
	const status = (await expectOk(
		await fetch(req.statusUrl, { headers: headers() }),
		'fal status',
	)) as {
		status: string;
	};
	if (status.status !== 'COMPLETED') return null;
	return (await expectOk(await fetch(req.responseUrl, { headers: headers() }), 'fal result')) as T;
}

/** First image URL from an image-model result. */
export function firstImage(result: { images?: { url: string }[] }, what: string): string {
	const url = result.images?.[0]?.url;
	if (!url) throw new Error(`${what} returned no image`);
	return url;
}

/**
 * Wording shared by every photographic prompt: this is a business platform,
 * so everything should look like a real, softly lit professional photograph.
 */
export const PHOTO_STYLE =
	'Professional business photography: shot on a full-frame camera with an 85mm lens, soft diffused lighting, natural skin texture, true-to-life colours, sharp focus. A real photograph, not an illustration, painting or 3D render.';
