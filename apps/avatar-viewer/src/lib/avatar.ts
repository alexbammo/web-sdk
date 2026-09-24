import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Two ways to get a 3D person into the scene:
//  1. A real textured mesh from an image-to-3D model (Meshy / Hunyuan3D / TRELLIS),
//     loaded as GLB and normalised to real-world size.
//  2. A local, instant 2.5D "relief": the person is cut out with MediaPipe's
//     selfie segmenter and the silhouette is inflated into a closed volume.
//     It reads well from the front ±60°, which is what a profile shot supports.

/** Head-and-shoulders bust height in metres (crown to mid-chest). */
const BUST_HEIGHT = 0.6;

export interface AvatarHandle {
	object: THREE.Group;
	kind: 'mesh' | 'relief';
	/** Average clothing colour, used for the seated torso proxy. */
	clothing: THREE.Color;
	dispose(): void;
}

function disposeTree(root: THREE.Object3D) {
	root.traverse((o) => {
		const mesh = o as THREE.Mesh;
		if (!mesh.isMesh) return;
		mesh.geometry.dispose();
		const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
		for (const m of mats) {
			for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
			m.dispose();
		}
	});
}

// ---------------- photo helpers ----------------

export async function loadImage(src: string): Promise<HTMLImageElement> {
	const img = new Image();
	img.crossOrigin = 'anonymous';
	img.src = src;
	await img.decode();
	return img;
}

/** Downscale to a JPEG data URL (keeps uploads and Claude image tokens small). */
export function toDataUrl(img: HTMLImageElement, max = 1024): string {
	const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
	const c = document.createElement('canvas');
	c.width = Math.round(img.naturalWidth * s);
	c.height = Math.round(img.naturalHeight * s);
	c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
	return c.toDataURL('image/jpeg', 0.9);
}

/** Average colour of the bottom-centre of a portrait – usually their top/jacket. */
export function sampleClothing(img: HTMLImageElement): THREE.Color {
	const c = document.createElement('canvas');
	c.width = c.height = 32;
	const ctx = c.getContext('2d', { willReadFrequently: true })!;
	ctx.drawImage(img, 0, 0, 32, 32);
	const { data } = ctx.getImageData(10, 27, 12, 5);
	let r = 0,
		g = 0,
		b = 0;
	for (let i = 0; i < data.length; i += 4) {
		r += data[i];
		g += data[i + 1];
		b += data[i + 2];
	}
	const n = data.length / 4;
	return new THREE.Color().setRGB(r / n / 255, g / n / 255, b / n / 255, THREE.SRGBColorSpace);
}

// ---------------- 1. generated mesh ----------------

export async function loadMeshAvatar(url: string, clothing: THREE.Color): Promise<AvatarHandle> {
	const gltf = await new GLTFLoader().loadAsync(url);
	const model = gltf.scene;
	model.traverse((o) => {
		const mesh = o as THREE.Mesh;
		if (!mesh.isMesh) return;
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
		for (const m of mats as THREE.MeshStandardMaterial[]) {
			// Generated PBR maps tend to be too shiny/metallic for skin and cloth.
			if ('metalness' in m) m.metalness = Math.min(m.metalness, 0.05);
			if ('roughness' in m) m.roughness = Math.max(m.roughness, 0.55);
		}
	});
	const box = new THREE.Box3().setFromObject(model);
	const size = box.getSize(new THREE.Vector3());
	const centre = box.getCenter(new THREE.Vector3());
	const scale = BUST_HEIGHT / size.y;
	model.position.set(-centre.x, -box.min.y, -centre.z);
	const group = new THREE.Group();
	const holder = new THREE.Group();
	holder.add(model);
	holder.scale.setScalar(scale);
	group.add(holder);
	group.name = 'avatar-mesh';
	return { object: group, kind: 'mesh', clothing, dispose: () => disposeTree(group) };
}

// ---------------- 2. local relief ----------------

const GRID = 192;
/** Typical forehead-to-chin height, which is roughly what BlazeFace's box spans. */
const FACE_BOX_HEIGHT_M = 0.2;
/** How far below the chin the bust is cut (upper chest). */
const CHIN_TO_CUT_M = 0.34;

type Vision = typeof import('@mediapipe/tasks-vision');
interface Detectors {
	segmenter: import('@mediapipe/tasks-vision').ImageSegmenter | null;
	face: import('@mediapipe/tasks-vision').FaceDetector | null;
}
let detectorsPromise: Promise<Detectors> | null = null;

function detectors(): Promise<Detectors> {
	detectorsPromise ??= (async () => {
		let vision: Vision;
		let fileset: Awaited<ReturnType<Vision['FilesetResolver']['forVisionTasks']>>;
		// WASM runtime + models are self-hosted under /mediapipe (see scripts/copy-mediapipe.mjs).
		const base = `${import.meta.env.BASE_URL}mediapipe`;
		try {
			vision = await import('@mediapipe/tasks-vision');
			fileset = await vision.FilesetResolver.forVisionTasks(base);
		} catch (err) {
			console.warn('MediaPipe unavailable, using an oval mask', err);
			return { segmenter: null, face: null };
		}
		const [segmenter, face] = await Promise.all([
			vision.ImageSegmenter.createFromOptions(fileset, {
				baseOptions: { modelAssetPath: `${base}/selfie_segmenter.tflite` },
				runningMode: 'IMAGE',
				outputConfidenceMasks: true,
				outputCategoryMask: false,
			}).catch((err) => (console.warn('Selfie segmenter unavailable', err), null)),
			vision.FaceDetector.createFromOptions(fileset, {
				baseOptions: { modelAssetPath: `${base}/blaze_face_short_range.tflite` },
				runningMode: 'IMAGE',
				minDetectionConfidence: 0.5,
			}).catch((err) => (console.warn('Face detector unavailable', err), null)),
		]);
		return { segmenter, face };
	})();
	return detectorsPromise;
}

/** Person-probability mask resampled to GRID×GRID (row 0 = top of image). */
function personMask(img: HTMLImageElement, seg: Detectors['segmenter']): Float32Array {
	const out = new Float32Array(GRID * GRID);
	if (seg) {
		const result = seg.segment(img);
		const mask = result.confidenceMasks?.[0];
		if (mask) {
			const src = mask.getAsFloat32Array();
			const { width, height } = mask;
			// bilinear resample – nearest-neighbour leaves a staircase on the silhouette
			for (let y = 0; y < GRID; y++)
				for (let x = 0; x < GRID; x++) {
					const fx = Math.min(width - 1.001, Math.max(0, ((x + 0.5) / GRID) * width - 0.5));
					const fy = Math.min(height - 1.001, Math.max(0, ((y + 0.5) / GRID) * height - 0.5));
					const x0 = Math.floor(fx),
						y0 = Math.floor(fy);
					const tx = fx - x0,
						ty = fy - y0;
					const i0 = y0 * width + x0;
					const top = src[i0] * (1 - tx) + src[i0 + 1] * tx;
					const bot = src[i0 + width] * (1 - tx) + src[i0 + width + 1] * tx;
					out[y * GRID + x] = top * (1 - ty) + bot * ty;
				}
			result.close();
			return out;
		}
		result.close();
	}
	// Fallback: head oval + shoulders, typical of a centred headshot.
	for (let y = 0; y < GRID; y++)
		for (let x = 0; x < GRID; x++) {
			const u = x / GRID - 0.5;
			const v = y / GRID;
			const head = (u / 0.24) ** 2 + ((v - 0.4) / 0.3) ** 2 < 1;
			const shoulders = v > 0.68 && Math.abs(u) < 0.2 + (v - 0.68) * 1.4;
			out[y * GRID + x] = head || shoulders ? 1 : 0;
		}
	return out;
}

/** Face box in normalised image coordinates (0..1, y down), or null. */
function detectFace(img: HTMLImageElement, face: Detectors['face']) {
	if (!face) return null;
	const best = face
		.detect(img)
		.detections.filter((d) => d.boundingBox)
		.sort(
			(a, b) =>
				b.boundingBox!.width * b.boundingBox!.height - a.boundingBox!.width * a.boundingBox!.height,
		)[0];
	if (!best?.boundingBox) return null;
	const { originX, originY, width, height } = best.boundingBox;
	const W = img.naturalWidth;
	const H = img.naturalHeight;
	return {
		cx: (originX + width / 2) / W,
		cy: (originY + height / 2) / H,
		w: width / W,
		h: height / H,
	};
}

/** Two-pass chamfer distance (in grid cells) from the outside of the mask. */
function distanceInside(mask: Uint8Array): Float32Array {
	const INF = 1e6;
	const d = new Float32Array(GRID * GRID);
	for (let i = 0; i < d.length; i++) d[i] = mask[i] ? INF : 0;
	const a = 1,
		b = Math.SQRT2;
	for (let y = 0; y < GRID; y++)
		for (let x = 0; x < GRID; x++) {
			const i = y * GRID + x;
			if (!d[i]) continue;
			let v = d[i];
			if (x > 0) v = Math.min(v, d[i - 1] + a);
			if (y > 0) {
				v = Math.min(v, d[i - GRID] + a);
				if (x > 0) v = Math.min(v, d[i - GRID - 1] + b);
				if (x < GRID - 1) v = Math.min(v, d[i - GRID + 1] + b);
			}
			if (x === 0 || y === 0 || x === GRID - 1) v = Math.min(v, 1);
			d[i] = v;
		}
	for (let y = GRID - 1; y >= 0; y--)
		for (let x = GRID - 1; x >= 0; x--) {
			const i = y * GRID + x;
			if (!d[i]) continue;
			let v = d[i];
			if (x < GRID - 1) v = Math.min(v, d[i + 1] + a);
			if (y < GRID - 1) {
				v = Math.min(v, d[i + GRID] + a);
				if (x < GRID - 1) v = Math.min(v, d[i + GRID + 1] + b);
				if (x > 0) v = Math.min(v, d[i + GRID - 1] + b);
			}
			d[i] = v;
		}
	return d;
}

export async function buildReliefAvatar(img: HTMLImageElement): Promise<AvatarHandle> {
	const clothing = sampleClothing(img);
	const { segmenter, face } = await detectors();
	const prob = personMask(img, segmenter);
	const mask = new Uint8Array(GRID * GRID);
	for (let i = 0; i < mask.length; i++) mask[i] = prob[i] > 0.6 ? 1 : 0;

	let top = GRID,
		bottom = 0;
	for (let y = 0; y < GRID; y++)
		for (let x = 0; x < GRID; x++)
			if (mask[y * GRID + x]) {
				top = Math.min(top, y);
				bottom = Math.max(bottom, y);
			}
	if (top >= bottom) {
		top = 0;
		bottom = GRID - 1;
	}

	// Real-world scale comes from the face: a face box is ~20 cm tall whether
	// the photo is a tight headshot or a half-length shot. Without a face we
	// assume the silhouette is a head-and-shoulders bust.
	const faceBox = detectFace(img, face);
	let imageHeightM: number;
	let headCx: number, headCy: number, headRx: number, headRy: number;
	let cutRow = bottom;
	if (faceBox) {
		imageHeightM = FACE_BOX_HEIGHT_M / faceBox.h;
		headCx = faceBox.cx * GRID;
		headCy = (faceBox.cy - faceBox.h * 0.12) * GRID; // skull centre sits above the face centre
		headRx = faceBox.w * 0.62 * GRID;
		headRy = faceBox.h * 0.78 * GRID;
		const chin = faceBox.cy + faceBox.h / 2;
		cutRow = Math.min(bottom, Math.round((chin + CHIN_TO_CUT_M / imageHeightM) * GRID));
	} else {
		imageHeightM = BUST_HEIGHT / ((bottom - top + 1) / GRID);
		let hx = 0,
			hn = 0,
			minX = GRID,
			maxX = 0;
		const headEnd = top + (bottom - top) * 0.45;
		for (let y = top; y < headEnd; y++)
			for (let x = 0; x < GRID; x++)
				if (mask[y * GRID + x]) {
					hx += x;
					hn++;
					minX = Math.min(minX, x);
					maxX = Math.max(maxX, x);
				}
		headCx = hn ? hx / hn : GRID / 2;
		headRx = Math.max(8, (maxX - minX) / 2);
		headRy = headRx * 1.25;
		headCy = top + headRy;
	}
	// Cut the bust off at the chest so it sits at the table.
	for (let y = cutRow + 1; y < GRID; y++) for (let x = 0; x < GRID; x++) mask[y * GRID + x] = 0;
	const dist = distanceInside(mask);

	// Height field (0..1): a rounded profile from the distance transform so the
	// silhouette curves away at its edges, plus an ellipsoid for the skull/face.
	const rim = GRID * 0.1;
	const depth = new Float32Array(GRID * GRID);
	for (let y = 0; y < GRID; y++)
		for (let x = 0; x < GRID; x++) {
			const i = y * GRID + x;
			if (!mask[i]) continue;
			const t = Math.min(1, dist[i] / rim);
			let h = Math.sqrt(1 - (1 - t) * (1 - t)) * 0.5;
			const dx = (x - headCx) / headRx;
			const dy = (y - headCy) / headRy;
			const r2 = dx * dx + dy * dy;
			if (r2 < 1) {
				// round skull profile, eased to zero slope at its edge so there's no shading crease
				const k = 1 - r2;
				const ease = Math.min(1, k / 0.35);
				h += Math.sqrt(k) * ease * ease * (3 - 2 * ease) * 0.5 * Math.min(1, t * 3);
			}
			depth[i] = h;
		}

	const texture = new THREE.Texture(img);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 8;
	texture.needsUpdate = true;

	// Alpha is eroded slightly inside the mask so no background halo survives.
	const alphaData = new Uint8Array(GRID * GRID * 4);
	for (let y = 0; y < GRID; y++)
		for (let x = 0; x < GRID; x++) {
			const i = y * GRID + x;
			const v = mask[i]
				? Math.round(
						Math.min(1, Math.max(0, (prob[i] - 0.6) / 0.25)) * Math.min(1, dist[i] / 1.5) * 255,
					)
				: 0;
			const o = ((GRID - 1 - y) * GRID + x) * 4; // flip: DataTexture row 0 is the bottom
			alphaData[o] = alphaData[o + 1] = alphaData[o + 2] = v;
			alphaData[o + 3] = 255;
		}
	const alphaMap = new THREE.DataTexture(alphaData, GRID, GRID);
	alphaMap.magFilter = alphaMap.minFilter = THREE.LinearFilter;
	alphaMap.needsUpdate = true;

	const height = imageHeightM;
	const width = height * (img.naturalWidth / img.naturalHeight);
	const headWidthM = (headRx * 2 * width) / GRID;
	const thickness = Math.max(0.16, headWidthM * 1.1); // front-to-back depth at the thickest point

	const makeSide = (front: boolean) => {
		const geo = new THREE.PlaneGeometry(width, height, GRID - 1, GRID - 1);
		const pos = geo.attributes.position as THREE.BufferAttribute;
		for (let i = 0; i < pos.count; i++) {
			const gx = i % GRID;
			const gy = Math.floor(i / GRID); // PlaneGeometry rows go top -> bottom
			// the back is mirrored below, so read its depth from the mirrored column
			const h = depth[gy * GRID + (front ? gx : GRID - 1 - gx)];
			pos.setZ(i, (front ? 1 : -0.75) * h * thickness * 0.5);
		}
		if (!front) {
			// mirror so the back faces outward
			geo.scale(-1, 1, 1);
			const uv = geo.attributes.uv as THREE.BufferAttribute;
			for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
		}
		geo.computeVertexNormals();
		const mat = new THREE.MeshStandardMaterial({
			map: front ? texture : null,
			alphaMap,
			alphaTest: 0.5,
			roughness: 0.78,
			// The photo already contains its own lighting; keep added light gentle.
			envMapIntensity: 0.55,
			color: front ? 0xe8e8e8 : clothing.clone().lerp(new THREE.Color(0x222222), 0.35),
		});
		const mesh = new THREE.Mesh(geo, mat);
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		// alpha-tested depth so shadows match the silhouette, not the whole plane
		mesh.customDepthMaterial = new THREE.MeshDepthMaterial({
			depthPacking: THREE.RGBADepthPacking,
			alphaMap,
			alphaTest: 0.5,
		});
		return mesh;
	};

	const group = new THREE.Group();
	const bust = new THREE.Group();
	bust.add(makeSide(true), makeSide(false));
	// Put the cut line at y = 0 and the face on the centre line.
	bust.position.y = -(height / 2 - ((cutRow + 1) / GRID) * height);
	bust.position.x = -(((headCx + 0.5) / GRID) * width - width / 2);
	group.add(bust);
	group.name = 'avatar-relief';
	return { object: group, kind: 'relief', clothing, dispose: () => disposeTree(group) };
}
