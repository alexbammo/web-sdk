// Self-host the MediaPipe WASM runtime (no third-party CDN at runtime).
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const src = fileURLToPath(
	new URL('../node_modules/@mediapipe/tasks-vision/wasm/', import.meta.url),
);
const dest = new URL('../public/mediapipe/', import.meta.url);
mkdirSync(dest, { recursive: true });
for (const f of [
	'vision_wasm_internal.js',
	'vision_wasm_internal.wasm',
	'vision_wasm_nosimd_internal.js',
	'vision_wasm_nosimd_internal.wasm',
]) {
	cpSync(join(src, f), new URL(f, dest));
}

// The two small models (~250 KB each) are fetched once from Google's model bucket.
const MODELS = {
	'selfie_segmenter.tflite':
		'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite',
	'blaze_face_short_range.tflite':
		'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite',
};
for (const [file, url] of Object.entries(MODELS)) {
	const path = new URL(file, dest);
	if (existsSync(path)) continue;
	try {
		const res = await fetch(url);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		writeFileSync(path, Buffer.from(await res.arrayBuffer()));
	} catch (err) {
		console.warn(
			`[mediapipe] could not download ${url} (${err.message}); the 2.5D avatar will fall back to simpler shapes`,
		);
	}
}
