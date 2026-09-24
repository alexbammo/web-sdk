import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

const loader = new GLTFLoader();
const cache = new Map();

export const CHARACTERS = {
	players: ['mini-characters/character-male-a', 'mini-characters/character-female-b', 'mini-characters/character-male-c', 'mini-characters/character-female-d'],
	shoppers: [
		'mini-characters/character-male-b',
		'mini-characters/character-female-a',
		'mini-characters/character-male-d',
		'mini-characters/character-female-c',
		'mini-characters/character-male-e',
		'mini-characters/character-female-e',
		'mini-characters/character-male-f',
		'mini-characters/character-female-f',
		'mini-market/character-employee'
	],
	zombie: 'graveyard/character-zombie',
	ghost: 'graveyard/character-ghost',
	skeleton: 'graveyard/character-skeleton',
	vampire: 'graveyard/character-vampire'
};

export async function loadModel(name) {
	if (cache.has(name)) return cache.get(name);
	const p = loader.loadAsync(`models/${name}.glb`).then((g) => {
		g.scene.updateMatrixWorld(true);
		g.scene.traverse((o) => {
			if (o.isMesh) {
				o.castShadow = true;
				o.receiveShadow = true;
				const mats = Array.isArray(o.material) ? o.material : [o.material];
				for (const m of mats) {
					if (m.map) m.map.anisotropy = 4;
					m.roughness = Math.max(m.roughness ?? 1, 0.55);
					m.metalness = Math.min(m.metalness ?? 0, 0.2);
				}
			}
		});
		return g;
	});
	cache.set(name, p);
	return p;
}

// Merge a static model into one geometry per material, normalised so its footprint is centred on the
// origin with its base at y = 0 and scaled to a unit box (the layout then scales to real dimensions).
const mergedCache = new Map();
export async function mergedModel(name) {
	if (mergedCache.has(name)) return mergedCache.get(name);
	const g = await loadModel(name);
	const byMat = new Map();
	g.scene.traverse((o) => {
		if (!o.isMesh) return;
		const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
		for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
		if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
		const key = o.material.uuid;
		if (!byMat.has(key)) byMat.set(key, { mat: o.material, geos: [] });
		byMat.get(key).geos.push(geo.index ? geo.toNonIndexed() : geo);
	});
	const parts = [...byMat.values()].map(({ mat, geos }) => ({ mat, geo: mergeGeometries(geos) }));
	const box = new THREE.Box3();
	for (const p of parts) {
		p.geo.computeBoundingBox();
		box.union(p.geo.boundingBox);
	}
	const size = box.getSize(new THREE.Vector3());
	const c = box.getCenter(new THREE.Vector3());
	const m = new THREE.Matrix4().makeScale(1 / size.x, 1 / size.y, 1 / size.z).multiply(new THREE.Matrix4().makeTranslation(-c.x, -box.min.y, -c.z));
	for (const p of parts) p.geo.applyMatrix4(m);
	const res = { parts, size };
	mergedCache.set(name, res);
	return res;
}

// Build InstancedMeshes for many placements of static props: [{m, x, y, z, ry, s:[w,h,d]}]
export async function instanceProps(props, opts = {}) {
	const group = new THREE.Group();
	const byModel = new Map();
	for (const p of props) {
		if (!byModel.has(p.m)) byModel.set(p.m, []);
		byModel.get(p.m).push(p);
	}
	const dummy = new THREE.Object3D();
	await Promise.all(
		[...byModel.entries()].map(async ([name, list]) => {
			const { parts } = await mergedModel(name);
			for (const part of parts) {
				const mat = opts.material ? opts.material(part.mat, name) : part.mat;
				const im = new THREE.InstancedMesh(part.geo, mat, list.length);
				list.forEach((p, i) => {
					dummy.position.set(p.x, p.y || 0, p.z);
					dummy.rotation.set(0, p.ry || 0, 0);
					dummy.scale.set(...p.s);
					dummy.updateMatrix();
					im.setMatrixAt(i, dummy.matrix);
				});
				im.castShadow = true;
				im.receiveShadow = true;
				im.computeBoundingSphere();
				group.add(im);
			}
		})
	);
	return group;
}

// A single normalised static model scaled so its largest dimension equals `size`.
export async function propInstance(name, size) {
	const { parts } = await mergedModel(name);
	const g = await loadModel(name);
	const box = new THREE.Box3().setFromObject(g.scene);
	const dims = box.getSize(new THREE.Vector3());
	const k = size / Math.max(dims.x, dims.y, dims.z);
	const grp = new THREE.Group();
	for (const part of parts) {
		const mesh = new THREE.Mesh(part.geo, part.mat);
		mesh.scale.set(dims.x * k, dims.y * k, dims.z * k);
		mesh.castShadow = true;
		grp.add(mesh);
	}
	return grp;
}

// Animated character clone scaled to the requested height.
export async function character(name, height = 1.7) {
	const g = await loadModel(name);
	const obj = SkeletonUtils.clone(g.scene);
	const box = new THREE.Box3().setFromObject(g.scene);
	const h = box.max.y - box.min.y;
	const k = height / h;
	const wrap = new THREE.Group();
	obj.scale.setScalar(k);
	obj.position.y = -box.min.y * k;
	wrap.add(obj);
	const mixer = new THREE.AnimationMixer(obj);
	const actions = {};
	for (const clip of g.animations) actions[clip.name] = mixer.clipAction(clip);
	let current = null;
	const play = (n, fade = 0.2, timeScale = 1) => {
		const a = actions[n];
		if (!a) return;
		a.timeScale = timeScale;
		if (current === a) return;
		a.reset().play();
		if (n === 'die') {
			a.clampWhenFinished = true;
			a.setLoop(THREE.LoopOnce, 1);
		}
		if (current) current.crossFadeTo(a, fade, false);
		current = a;
	};
	obj.traverse((o) => {
		if (o.isMesh) {
			o.castShadow = true;
			o.receiveShadow = true;
			o.frustumCulled = false;
		}
	});
	return { root: wrap, model: obj, mixer, actions, play };
}

// ---------- procedural textures ----------
export function canvasTexture(w, h, draw, opts = {}) {
	const c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	const ctx = c.getContext('2d');
	draw(ctx, w, h);
	const t = new THREE.CanvasTexture(c);
	if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
	t.anisotropy = 8;
	if (opts.repeat) {
		t.wrapS = t.wrapT = THREE.RepeatWrapping;
		t.repeat.set(...opts.repeat);
	}
	return t;
}

function noise(ctx, w, h, amt, alpha = 1) {
	const img = ctx.getImageData(0, 0, w, h);
	for (let i = 0; i < img.data.length; i += 4) {
		const n = (Math.random() - 0.5) * amt;
		img.data[i] += n;
		img.data[i + 1] += n;
		img.data[i + 2] += n;
		img.data[i + 3] *= alpha;
	}
	ctx.putImageData(img, 0, 0);
}

export function floorTextures() {
	const tiles = 4;
	const map = canvasTexture(
		512,
		512,
		(ctx, w, h) => {
			const s = w / tiles;
			for (let y = 0; y < tiles; y++)
				for (let x = 0; x < tiles; x++) {
					const v = 214 + Math.random() * 16;
					const warm = Math.random() * 6;
					ctx.fillStyle = `rgb(${v + warm},${v + warm * 0.6},${v - 4})`;
					ctx.fillRect(x * s, y * s, s, s);
					// terrazzo flecks
					for (let k = 0; k < 90; k++) {
						const g = 120 + Math.random() * 100;
						ctx.fillStyle = `rgba(${g},${g},${g - 10},0.5)`;
						ctx.fillRect(x * s + Math.random() * s, y * s + Math.random() * s, 1.5, 1.5);
					}
				}
			noise(ctx, w, h, 10);
			ctx.strokeStyle = 'rgba(90,85,80,0.9)';
			ctx.lineWidth = 3;
			for (let i = 0; i <= tiles; i++) {
				ctx.beginPath();
				ctx.moveTo(i * s, 0);
				ctx.lineTo(i * s, h);
				ctx.moveTo(0, i * s);
				ctx.lineTo(w, i * s);
				ctx.stroke();
			}
		},
		{ repeat: [96 / 2.4, 72 / 2.4] }
	);
	const rough = canvasTexture(
		256,
		256,
		(ctx, w, h) => {
			ctx.fillStyle = 'rgb(70,70,70)';
			ctx.fillRect(0, 0, w, h);
			for (let k = 0; k < 40; k++) {
				const g = 60 + Math.random() * 120;
				ctx.fillStyle = `rgba(${g},${g},${g},0.25)`;
				ctx.beginPath();
				ctx.ellipse(Math.random() * w, Math.random() * h, 10 + Math.random() * 60, 6 + Math.random() * 30, Math.random() * 3, 0, 7);
				ctx.fill();
			}
			noise(ctx, w, h, 30);
			ctx.strokeStyle = 'rgb(220,220,220)';
			ctx.lineWidth = 3;
			const s = w / tiles;
			for (let i = 0; i <= tiles; i++) {
				ctx.beginPath();
				ctx.moveTo(i * s, 0);
				ctx.lineTo(i * s, h);
				ctx.moveTo(0, i * s);
				ctx.lineTo(w, i * s);
				ctx.stroke();
			}
		},
		{ srgb: false, repeat: [96 / 2.4, 72 / 2.4] }
	);
	return { map, rough };
}

export function ceilingTexture() {
	return canvasTexture(
		256,
		256,
		(ctx, w, h) => {
			ctx.fillStyle = '#c9c7c0';
			ctx.fillRect(0, 0, w, h);
			for (let i = 0; i < 1400; i++) {
				ctx.fillStyle = `rgba(80,80,80,${Math.random() * 0.3})`;
				ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
			}
			ctx.strokeStyle = '#8d8b85';
			ctx.lineWidth = 4;
			ctx.strokeRect(0, 0, w, h);
			ctx.strokeRect(0, 0, w / 2, h / 2);
			ctx.strokeRect(w / 2, h / 2, w / 2, h / 2);
		},
		{ repeat: [96 / 1.2, 72 / 1.2] }
	);
}

export function wallTexture() {
	return canvasTexture(
		512,
		512,
		(ctx, w, h) => {
			ctx.fillStyle = '#e6e2d6';
			ctx.fillRect(0, 0, w, h);
			noise(ctx, w, h, 8);
			// brand stripe and kick plate
			ctx.fillStyle = '#1b6e4a';
			ctx.fillRect(0, h * 0.62, w, h * 0.06);
			ctx.fillStyle = '#e8b400';
			ctx.fillRect(0, h * 0.69, w, h * 0.015);
			ctx.fillStyle = '#5b5f63';
			ctx.fillRect(0, h * 0.95, w, h * 0.05);
			// water stains - it's a faded shopping centre
			for (let i = 0; i < 6; i++) {
				const x = Math.random() * w;
				const g = ctx.createLinearGradient(x, 0, x, h * 0.5);
				g.addColorStop(0, 'rgba(120,100,60,0.18)');
				g.addColorStop(1, 'rgba(120,100,60,0)');
				ctx.fillStyle = g;
				ctx.fillRect(x - 10, 0, 20 + Math.random() * 30, h * 0.5);
			}
		},
		{ repeat: [1, 1] }
	);
}

export function signTexture(text, color = '#ffffff', bg = '#123b2a', w = 1024, h = 128) {
	return canvasTexture(w, h, (ctx) => {
		ctx.fillStyle = bg;
		ctx.fillRect(0, 0, w, h);
		ctx.strokeStyle = 'rgba(255,255,255,0.25)';
		ctx.lineWidth = 6;
		ctx.strokeRect(3, 3, w - 6, h - 6);
		ctx.fillStyle = color;
		ctx.font = `bold ${Math.floor(h * 0.55)}px "Trebuchet MS", Arial, sans-serif`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		let size = Math.floor(h * 0.55);
		while (ctx.measureText(text).width > w * 0.92 && size > 10) {
			size -= 2;
			ctx.font = `bold ${size}px "Trebuchet MS", Arial, sans-serif`;
		}
		ctx.fillText(text, w / 2, h / 2 + 2);
	});
}

export function pillsModel() {
	const g = new THREE.Group();
	const tex = canvasTexture(128, 64, (ctx) => {
		ctx.fillStyle = '#f4f4f4';
		ctx.fillRect(0, 0, 128, 64);
		ctx.fillStyle = '#d42a2a';
		ctx.fillRect(10, 18, 30, 8);
		ctx.fillRect(21, 7, 8, 30);
		ctx.fillStyle = '#244';
		ctx.font = 'bold 14px Arial';
		ctx.fillText('PARACETAMOL', 44, 28);
		ctx.fillText('500mg', 44, 48);
	});
	const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.08), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
	m.position.y = 0.06;
	m.castShadow = true;
	g.add(m);
	return g;
}

export function ringModel() {
	const g = new THREE.Group();
	const band = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 12, 32), new THREE.MeshStandardMaterial({ color: 0xffd27a, metalness: 1, roughness: 0.18 }));
	band.position.y = 0.07;
	const gem = new THREE.Mesh(
		new THREE.OctahedronGeometry(0.025),
		new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0, transmission: 0.6, ior: 2.4, emissive: 0x88aaff, emissiveIntensity: 0.6 })
	);
	gem.position.y = 0.13;
	const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.12), new THREE.MeshStandardMaterial({ color: 0x5a0f2a, roughness: 0.9 }));
	cushion.position.y = 0.025;
	g.add(band, gem, cushion);
	return g;
}

export function batteryModel() {
	const g = new THREE.Group();
	const body = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 16), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.4, roughness: 0.4 }));
	const band = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.05, 16), new THREE.MeshStandardMaterial({ color: 0xd9a400, metalness: 0.6, roughness: 0.3 }));
	body.position.y = band.position.y = 0.08;
	band.position.y = 0.13;
	g.add(body, band);
	g.traverse((o) => (o.castShadow = true));
	return g;
}
