import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Poly Haven (https://polyhaven.com) assets are CC0. We resolve every asset
// through the public files API rather than hard-coding CDN paths, so naming
// changes on their side don't break us, and we try a list of candidate IDs so
// one missing asset falls through to the next (and finally to a plain colour).

const API = 'https://api.polyhaven.com/files/';

type Resolution = '1k' | '2k' | '4k';
interface FileRef {
	url: string;
	include?: Record<string, { url: string }>;
}
type FilesJson = Record<string, Record<string, Record<string, FileRef>>>;

const filesCache = new Map<string, Promise<FilesJson | null>>();

function files(id: string): Promise<FilesJson | null> {
	let p = filesCache.get(id);
	if (!p) {
		p = fetch(API + id)
			.then((r) => (r.ok ? (r.json() as Promise<FilesJson>) : null))
			.catch(() => null);
		filesCache.set(id, p);
	}
	return p;
}

function pick(
	entry: Record<string, Record<string, FileRef>> | undefined,
	res: Resolution,
	formats: string[],
) {
	if (!entry) return undefined;
	const order: Resolution[] =
		res === '4k' ? ['4k', '2k', '1k'] : res === '2k' ? ['2k', '1k', '4k'] : ['1k', '2k'];
	for (const r of order) for (const f of formats) if (entry[r]?.[f]) return entry[r][f];
	return undefined;
}

async function firstResolved<T>(
	ids: readonly string[],
	load: (id: string) => Promise<T | null>,
): Promise<T | null> {
	for (const id of ids) {
		try {
			const out = await load(id);
			if (out) return out;
		} catch {
			// try the next candidate
		}
	}
	return null;
}

// ---------------- HDRIs ----------------

const hdrLoader = new HDRLoader();

export async function loadHdri(
	ids: readonly string[],
	res: Resolution = '2k',
): Promise<THREE.DataTexture | null> {
	return firstResolved(ids, async (id) => {
		const f = await files(id);
		const ref = pick(f?.hdri, res, ['hdr']);
		if (!ref) return null;
		const tex = await hdrLoader.loadAsync(ref.url);
		tex.mapping = THREE.EquirectangularReflectionMapping;
		tex.name = id;
		return tex;
	});
}

// ---------------- PBR textures ----------------

export interface PbrSet {
	id: string;
	map: THREE.Texture;
	normalMap?: THREE.Texture;
	roughnessMap?: THREE.Texture;
	aoMap?: THREE.Texture;
}

const texLoader = new THREE.TextureLoader();
texLoader.setCrossOrigin('anonymous');
const pbrCache = new Map<string, Promise<PbrSet | null>>();

async function loadTex(url: string, srgb: boolean) {
	const t = await texLoader.loadAsync(url);
	t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.anisotropy = 8;
	if (srgb) t.colorSpace = THREE.SRGBColorSpace;
	return t;
}

export function loadPbr(ids: readonly string[], res: Resolution = '1k'): Promise<PbrSet | null> {
	const key = ids.join('|') + res;
	let p = pbrCache.get(key);
	if (!p) {
		p = firstResolved(ids, async (id) => {
			const f = await files(id);
			if (!f) return null;
			const diff = pick(f.Diffuse ?? f.diffuse, res, ['jpg', 'png']);
			if (!diff) return null;
			const nor = pick(f.nor_gl, res, ['jpg', 'png']);
			const rough = pick(f.Rough ?? f.rough, res, ['jpg', 'png']);
			// ARM = AO (R), Roughness (G), Metal (B) – exactly the channels three.js reads.
			const arm = pick(f.arm, res, ['jpg', 'png']);
			const [map, normalMap, roughnessMap, aoMap] = await Promise.all([
				loadTex(diff.url, true),
				nor ? loadTex(nor.url, false) : undefined,
				rough ? loadTex(rough.url, false) : arm ? loadTex(arm.url, false) : undefined,
				arm ? loadTex(arm.url, false) : undefined,
			]);
			return { id, map, normalMap, roughnessMap, aoMap };
		});
		pbrCache.set(key, p);
	}
	return p;
}

/**
 * Returns a material immediately (plain colour) and upgrades it in place once
 * the Poly Haven texture set arrives. `repeat` is in texture tiles per unit UV.
 */
export function pbrMaterial(
	ids: readonly string[],
	opts: {
		color: THREE.ColorRepresentation;
		repeat?: [number, number];
		roughness?: number;
		tint?: THREE.ColorRepresentation;
	},
	onReady?: () => void,
): THREE.MeshStandardMaterial {
	const mat = new THREE.MeshStandardMaterial({
		color: opts.color,
		roughness: opts.roughness ?? 0.8,
	});
	loadPbr(ids).then((set) => {
		if (!set) return;
		const [rx, ry] = opts.repeat ?? [1, 1];
		const apply = (t?: THREE.Texture) => {
			if (!t) return t;
			const c = t.clone();
			c.repeat.set(rx, ry);
			c.needsUpdate = true;
			return c;
		};
		mat.map = apply(set.map) ?? null;
		mat.normalMap = apply(set.normalMap) ?? null;
		mat.roughnessMap = apply(set.roughnessMap) ?? null;
		mat.aoMap = apply(set.aoMap) ?? null;
		mat.color.set(opts.tint ?? 0xffffff);
		mat.roughness = 1;
		mat.needsUpdate = true;
		onReady?.();
	});
	return mat;
}

// ---------------- Models ----------------

export async function loadModel(
	ids: readonly string[],
	res: Resolution = '1k',
): Promise<THREE.Group | null> {
	return firstResolved(ids, async (id) => {
		const f = await files(id);
		const ref = pick(f?.gltf, res, ['gltf']);
		if (!ref) return null;
		const include = ref.include ?? {};
		const manager = new THREE.LoadingManager();
		// The .gltf references textures by relative path; map each to its CDN URL.
		manager.setURLModifier((url) => {
			for (const [rel, file] of Object.entries(include)) if (url.endsWith(rel)) return file.url;
			return url;
		});
		const gltf = await new GLTFLoader(manager).loadAsync(ref.url);
		gltf.scene.name = id;
		gltf.scene.traverse((o) => {
			if ((o as THREE.Mesh).isMesh) {
				o.castShadow = true;
				o.receiveShadow = true;
			}
		});
		return gltf.scene;
	});
}

// Candidate IDs, best first. Anything that 404s is skipped.
export const PH = {
	hdri: {
		interiorWarm: ['wooden_lounge', 'lythwood_room', 'hotel_room', 'brown_photostudio_02'],
		interiorBright: ['artist_workshop', 'lythwood_room', 'studio_small_09'],
		morning: ['kiara_1_dawn', 'spruit_sunrise', 'kloofendal_48d_partly_cloudy_puresky'],
		midday: ['kloofendal_48d_partly_cloudy_puresky', 'royal_esplanade', 'lebombo'],
		golden: ['venice_sunset', 'spruit_sunrise', 'kiara_1_dawn'],
		dusk: ['venice_sunset', 'dikhololo_night', 'royal_esplanade'],
		night: ['shanghai_bund', 'rooftop_night', 'dikhololo_night', 'moonless_golf'],
	},
	tex: {
		woodFloor: ['herringbone_parquet', 'wood_floor', 'laminate_floor_02'],
		deck: ['wood_floor_deck', 'wood_planks', 'weathered_planks'],
		plaster: ['painted_plaster_wall', 'plastered_wall', 'beige_wall_001'],
		brick: ['red_brick_03', 'brick_wall_001', 'red_bricks_04'],
		concrete: ['concrete_floor_02', 'concrete_floor_worn_001', 'concrete_wall_008'],
		tableWood: ['wood_table_001', 'dark_wood', 'oak_veneer_01'],
		marble: ['marble_01', 'marble_tiles'],
		tiles: ['floor_tiles_06', 'floor_tiles_02', 'patterned_cobblestone'],
		fabric: ['fabric_pattern_07', 'fabric_pattern_05', 'denim_fabric'],
		leather: ['leather_red_03', 'fabric_leather_02', 'leather_white'],
	},
	models: {
		plant: ['potted_plant_01', 'potted_plant_02', 'potted_plant_04'],
		lantern: ['Lantern_01', 'vintage_oil_lamp'],
	},
} as const satisfies Record<string, Record<string, readonly string[]>>;
