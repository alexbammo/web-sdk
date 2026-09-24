import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { PropId } from './types';

// Procedural furniture and props. Everything is built at real-world scale
// (metres) so lighting, shadows and the avatar sit together believably.

export function shadowed<T extends THREE.Object3D>(o: T, cast = true, receive = true): T {
	o.traverse((c) => {
		if ((c as THREE.Mesh).isMesh) {
			c.castShadow = cast;
			c.receiveShadow = receive;
		}
	});
	return o;
}

export function box(w: number, h: number, d: number, mat: THREE.Material, radius = 0) {
	const geo =
		radius > 0 ? new RoundedBoxGeometry(w, h, d, 3, radius) : new THREE.BoxGeometry(w, h, d);
	return shadowed(new THREE.Mesh(geo, mat));
}

export function cyl(rTop: number, rBottom: number, h: number, mat: THREE.Material, seg = 32) {
	return shadowed(new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), mat));
}

function lathe(points: [number, number][], mat: THREE.Material, seg = 48) {
	return shadowed(
		new THREE.Mesh(
			new THREE.LatheGeometry(
				points.map(([x, y]) => new THREE.Vector2(x, y)),
				seg,
			),
			mat,
		),
	);
}

const metalDark = new THREE.MeshStandardMaterial({
	color: 0x1d1d1f,
	metalness: 0.85,
	roughness: 0.35,
});
const brass = new THREE.MeshStandardMaterial({ color: 0xc8a25a, metalness: 1, roughness: 0.28 });
const ceramic = new THREE.MeshPhysicalMaterial({
	color: 0xf4f1ea,
	roughness: 0.18,
	clearcoat: 0.8,
	clearcoatRoughness: 0.1,
});
const glass = new THREE.MeshPhysicalMaterial({
	color: 0xffffff,
	roughness: 0.02,
	transmission: 1,
	thickness: 0.004,
	ior: 1.5,
	transparent: true,
});

// ---------------- furniture ----------------

export function roundTable(top: THREE.Material, opts: { radius?: number; height?: number } = {}) {
	const r = opts.radius ?? 0.38;
	const h = opts.height ?? 0.75;
	const g = new THREE.Group();
	const slab = cyl(r, r, 0.03, top, 64);
	slab.position.y = h - 0.015;
	const edge = cyl(r + 0.004, r + 0.004, 0.012, brass, 64);
	edge.position.y = h - 0.03;
	const stem = cyl(0.03, 0.035, h - 0.05, metalDark);
	stem.position.y = (h - 0.05) / 2 + 0.02;
	const foot = cyl(0.2, 0.22, 0.025, metalDark, 48);
	foot.position.y = 0.0125;
	g.add(slab, edge, stem, foot);
	g.userData.topY = h;
	return g;
}

export function rectTable(top: THREE.Material, w = 1.4, d = 0.75, h = 0.75) {
	const g = new THREE.Group();
	const slab = box(w, 0.04, d, top, 0.008);
	slab.position.y = h - 0.02;
	g.add(slab);
	for (const [x, z] of [
		[-1, -1],
		[1, -1],
		[-1, 1],
		[1, 1],
	]) {
		const leg = box(0.04, h - 0.04, 0.04, metalDark);
		leg.position.set(x * (w / 2 - 0.06), (h - 0.04) / 2, z * (d / 2 - 0.06));
		g.add(leg);
	}
	g.userData.topY = h;
	return g;
}

/** Bistro chair; faces +Z (a person sitting in it looks towards +Z). */
export function bistroChair(frame: THREE.Material, seat: THREE.Material) {
	const g = new THREE.Group();
	const s = box(0.44, 0.05, 0.42, seat, 0.02);
	s.position.y = 0.46;
	g.add(s);
	const legGeo = new THREE.CylinderGeometry(0.014, 0.012, 0.46, 12);
	for (const [x, z] of [
		[-0.19, -0.18],
		[0.19, -0.18],
		[-0.19, 0.18],
		[0.19, 0.18],
	]) {
		const leg = shadowed(new THREE.Mesh(legGeo, frame));
		leg.position.set(x, 0.23, z);
		leg.rotation.x = z > 0 ? -0.05 : 0.05;
		g.add(leg);
	}
	// curved back rest
	const back = shadowed(
		new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.014, 10, 48, Math.PI), frame),
	);
	back.position.set(0, 0.62, -0.2);
	back.rotation.x = -0.12;
	g.add(back);
	for (const x of [-0.19, 0.19]) {
		const post = cyl(0.013, 0.013, 0.36, frame, 12);
		post.position.set(x, 0.64, -0.2);
		g.add(post);
	}
	const slat = box(0.4, 0.07, 0.02, seat, 0.01);
	slat.position.set(0, 0.76, -0.215);
	g.add(slat);
	return g;
}

export function armchair(fabric: THREE.Material) {
	const g = new THREE.Group();
	const base = box(0.8, 0.42, 0.78, fabric, 0.06);
	base.position.y = 0.26;
	const back = box(0.8, 0.52, 0.18, fabric, 0.07);
	back.position.set(0, 0.66, -0.3);
	back.rotation.x = -0.12;
	const armL = box(0.16, 0.26, 0.74, fabric, 0.06);
	armL.position.set(-0.36, 0.55, 0);
	const armR = armL.clone();
	armR.position.x = 0.36;
	const cushion = box(0.5, 0.12, 0.56, fabric, 0.05);
	cushion.position.set(0, 0.52, 0.06);
	g.add(base, back, armL, armR, cushion);
	for (const [x, z] of [
		[-0.33, -0.33],
		[0.33, -0.33],
		[-0.33, 0.33],
		[0.33, 0.33],
	]) {
		const leg = cyl(0.02, 0.014, 0.08, brass, 12);
		leg.position.set(x, 0.04, z);
		g.add(leg);
	}
	return g;
}

// ---------------- lights ----------------

export function pendantLamp(color: THREE.Color, intensity: number, drop = 1.1) {
	const g = new THREE.Group();
	const cord = cyl(0.004, 0.004, drop, metalDark, 6);
	cord.position.y = -drop / 2;
	const shade = shadowed(
		new THREE.Mesh(
			new THREE.ConeGeometry(0.16, 0.18, 40, 1, true),
			new THREE.MeshStandardMaterial({
				color: 0x2b2b2b,
				metalness: 0.6,
				roughness: 0.4,
				side: THREE.DoubleSide,
			}),
		),
		false,
	);
	shade.position.y = -drop - 0.05;
	const bulb = new THREE.Mesh(
		new THREE.SphereGeometry(0.045, 20, 16),
		new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 4 }),
	);
	bulb.position.y = -drop - 0.11;
	const light = new THREE.SpotLight(color, intensity * 18, 7, Math.PI / 3.2, 0.6, 2);
	light.position.copy(bulb.position);
	light.target.position.set(0, -drop - 3, 0);
	light.castShadow = true;
	light.shadow.mapSize.set(1024, 1024);
	light.shadow.bias = -0.0004;
	g.add(cord, shade, bulb, light, light.target);
	g.userData.practical = [{ light, base: 18, bulb }];
	return g;
}

/** Catenary string of bulbs between two points, with a few real lights along it. */
export function stringLights(
	a: THREE.Vector3,
	b: THREE.Vector3,
	color: THREE.Color,
	intensity: number,
	bulbs = 14,
) {
	const g = new THREE.Group();
	const sag = a.distanceTo(b) * 0.08;
	const pts: THREE.Vector3[] = [];
	for (let i = 0; i <= 32; i++) {
		const t = i / 32;
		const p = a.clone().lerp(b, t);
		p.y -= Math.sin(Math.PI * t) * sag;
		pts.push(p);
	}
	const curve = new THREE.CatmullRomCurve3(pts);
	g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.004, 5), metalDark));
	const bulbMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 5 });
	const bulbGeo = new THREE.SphereGeometry(0.025, 12, 10);
	const practical: { light: THREE.PointLight; base: number; bulb?: THREE.Mesh }[] = [];
	for (let i = 1; i < bulbs; i++) {
		const p = curve.getPoint(i / bulbs);
		const bulb = new THREE.Mesh(bulbGeo, bulbMat);
		bulb.position.copy(p).add(new THREE.Vector3(0, -0.04, 0));
		g.add(bulb);
		if (i % 4 === 2) {
			const l = new THREE.PointLight(color, intensity * 1.2, 4.5, 2);
			l.position.copy(bulb.position);
			g.add(l);
			practical.push({ light: l, base: 1.2, bulb });
		}
	}
	g.userData.practical = practical;
	g.userData.bulbMaterial = bulbMat;
	return g;
}

export function tableLamp(color: THREE.Color, intensity: number) {
	const g = new THREE.Group();
	const base = lathe(
		[
			[0, 0],
			[0.07, 0],
			[0.075, 0.01],
			[0.02, 0.03],
			[0.012, 0.3],
			[0, 0.3],
		],
		brass,
	);
	const shade = shadowed(
		new THREE.Mesh(
			new THREE.CylinderGeometry(0.08, 0.14, 0.16, 40, 1, true),
			new THREE.MeshStandardMaterial({
				color: 0x1f4a3a,
				roughness: 0.5,
				side: THREE.DoubleSide,
				emissive: color,
				emissiveIntensity: 0.05,
			}),
		),
		false,
	);
	shade.position.y = 0.33;
	const light = new THREE.PointLight(color, intensity * 2.2, 4, 2);
	light.position.y = 0.3;
	// No shadow: the viewer uses VSM shadows (soft), which three.js doesn't support for point lights.
	g.add(base, shade, light);
	g.userData.practical = [{ light, base: 2.2 }];
	return g;
}

// ---------------- architecture ----------------

export function steelWindow(w: number, h: number, cols: number, rows: number) {
	const g = new THREE.Group();
	const t = 0.04;
	for (let i = 0; i <= cols; i++) {
		const m = box(t, h, t, metalDark);
		m.position.set(-w / 2 + (i * w) / cols, h / 2, 0);
		g.add(m);
	}
	for (let j = 0; j <= rows; j++) {
		const m = box(w + t, t, t, metalDark);
		m.position.set(0, (j * h) / rows, 0);
		g.add(m);
	}
	const pane = new THREE.Mesh(
		new THREE.PlaneGeometry(w, h),
		new THREE.MeshPhysicalMaterial({
			color: 0xffffff,
			roughness: 0.05,
			transmission: 1,
			thickness: 0.01,
			transparent: true,
			opacity: 0.25,
		}),
	);
	pane.position.y = h / 2;
	g.add(pane);
	return g;
}

export function railing(length: number, material: THREE.Material, height = 1.0, spacing = 0.14) {
	const g = new THREE.Group();
	const top = box(length, 0.05, 0.09, material, 0.01);
	top.position.y = height;
	const bottom = box(length, 0.04, 0.05, material);
	bottom.position.y = 0.08;
	g.add(top, bottom);
	const n = Math.floor(length / spacing);
	const balGeo = new THREE.BoxGeometry(0.03, height - 0.1, 0.03);
	const bal = new THREE.InstancedMesh(balGeo, material, n + 1);
	const m = new THREE.Matrix4();
	for (let i = 0; i <= n; i++) {
		m.makeTranslation(-length / 2 + i * spacing, height / 2, 0);
		bal.setMatrixAt(i, m);
	}
	shadowed(bal);
	g.add(bal);
	return g;
}

const bookColors = [
	0x6b2d2d, 0x2f4a6b, 0x3e5a3a, 0x8a6a3b, 0x2a2a2a, 0x7a5c8a, 0xb8a27a, 0x4a3226, 0x93502c,
];

export function bookshelf(w: number, h: number, wood: THREE.Material, seed = 1) {
	const g = new THREE.Group();
	const depth = 0.32;
	const shelves = Math.max(3, Math.round(h / 0.36));
	const sideL = box(0.03, h, depth, wood);
	sideL.position.set(-w / 2, h / 2, 0);
	const sideR = sideL.clone();
	sideR.position.x = w / 2;
	const backBoard = box(w, h, 0.02, wood);
	backBoard.position.set(0, h / 2, -depth / 2);
	g.add(sideL, sideR, backBoard);

	let rnd = seed * 9301 + 49297;
	const rand = () => (rnd = (rnd * 9301 + 49297) % 233280) / 233280;
	const books: {
		x: number;
		y: number;
		w: number;
		h: number;
		d: number;
		tilt: number;
		c: number;
	}[] = [];
	for (let s = 0; s < shelves; s++) {
		const y = (s * h) / shelves;
		const board = box(w, 0.025, depth, wood);
		board.position.set(0, y + 0.0125, 0);
		g.add(board);
		let x = -w / 2 + 0.03;
		while (x < w / 2 - 0.08) {
			const bw = 0.02 + rand() * 0.035;
			const bh = 0.2 + rand() * 0.1;
			if (rand() < 0.06) {
				x += 0.08; // gap
				continue;
			}
			books.push({
				x: x + bw / 2,
				y: y + 0.025,
				w: bw,
				h: bh,
				d: 0.18 + rand() * 0.06,
				tilt: rand() < 0.05 ? 0.2 : 0,
				c: Math.floor(rand() * bookColors.length),
			});
			x += bw + 0.002;
		}
	}
	const top = box(w + 0.04, 0.03, depth + 0.02, wood);
	top.position.y = h;
	g.add(top);

	const geo = new THREE.BoxGeometry(1, 1, 1);
	geo.translate(0, 0.5, 0);
	const mat = new THREE.MeshStandardMaterial({ roughness: 0.7 });
	const mesh = new THREE.InstancedMesh(geo, mat, books.length);
	const m = new THREE.Matrix4();
	const q = new THREE.Quaternion();
	const color = new THREE.Color();
	books.forEach((b, i) => {
		q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), b.tilt);
		m.compose(
			new THREE.Vector3(b.x, b.y, -depth / 2 + 0.02 + b.d / 2),
			q,
			new THREE.Vector3(b.w, b.h, b.d),
		);
		mesh.setMatrixAt(i, m);
		mesh.setColorAt(i, color.set(bookColors[b.c]).offsetHSL(0, 0, (Math.random() - 0.5) * 0.08));
	});
	shadowed(mesh);
	g.add(mesh);
	return g;
}

// ---------------- plants ----------------

export function proceduralPlant(
	height = 0.9,
	potColor: THREE.ColorRepresentation = 0xb4643c,
	seed = 3,
) {
	const g = new THREE.Group();
	const pot = lathe(
		[
			[0, 0],
			[0.13, 0],
			[0.16, 0.26],
			[0.17, 0.27],
			[0.17, 0.29],
			[0.15, 0.29],
			[0.15, 0.27],
			[0, 0.27],
		],
		new THREE.MeshStandardMaterial({ color: potColor, roughness: 0.85 }),
	);
	g.add(pot);
	const leafShape = new THREE.Shape();
	leafShape.moveTo(0, 0);
	leafShape.quadraticCurveTo(0.06, 0.12, 0, 0.3);
	leafShape.quadraticCurveTo(-0.06, 0.12, 0, 0);
	const leafGeo = new THREE.ShapeGeometry(leafShape, 8);
	const leafMat = new THREE.MeshStandardMaterial({
		color: 0x3f6b35,
		roughness: 0.55,
		side: THREE.DoubleSide,
	});
	let rnd = seed;
	const rand = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
	const count = Math.round(26 * height);
	const leaves = new THREE.InstancedMesh(leafGeo, leafMat, count);
	const m = new THREE.Matrix4();
	const color = new THREE.Color();
	for (let i = 0; i < count; i++) {
		const yaw = rand() * Math.PI * 2;
		const pitch = 0.2 + rand() * 0.9;
		const s = 0.7 + rand() * 0.8;
		const y = 0.27 + rand() * (height - 0.45);
		const e = new THREE.Euler(pitch, yaw, 0, 'YXZ');
		m.compose(
			new THREE.Vector3(Math.cos(yaw) * 0.03, y, Math.sin(yaw) * 0.03),
			new THREE.Quaternion().setFromEuler(e),
			new THREE.Vector3(s, s, s),
		);
		leaves.setMatrixAt(i, m);
		leaves.setColorAt(i, color.setHSL(0.27 + rand() * 0.06, 0.45, 0.22 + rand() * 0.12));
	}
	shadowed(leaves);
	g.add(leaves);
	return g;
}

// ---------------- table-top props ----------------

function cupAndSaucer(liquid: THREE.ColorRepresentation) {
	const g = new THREE.Group();
	const saucer = lathe(
		[
			[0, 0],
			[0.07, 0.002],
			[0.075, 0.012],
			[0.07, 0.014],
			[0, 0.008],
		],
		ceramic,
	);
	const cup = lathe(
		[
			[0, 0.012],
			[0.03, 0.012],
			[0.042, 0.03],
			[0.045, 0.07],
			[0.042, 0.07],
			[0.04, 0.032],
			[0.0, 0.03],
		],
		ceramic,
	);
	const drink = cyl(
		0.041,
		0.041,
		0.002,
		new THREE.MeshPhysicalMaterial({ color: liquid, roughness: 0.1, clearcoat: 1 }),
	);
	drink.position.y = 0.062;
	const handle = shadowed(
		new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.004, 8, 20, Math.PI * 1.3), ceramic),
	);
	handle.position.set(0.048, 0.046, 0);
	handle.rotation.z = -Math.PI * 0.65;
	g.add(saucer, cup, drink, handle);
	return g;
}

function wineGlass() {
	const g = new THREE.Group();
	const glassMesh = lathe(
		[
			[0, 0],
			[0.035, 0],
			[0.035, 0.002],
			[0.004, 0.006],
			[0.003, 0.1],
			[0.02, 0.11],
			[0.04, 0.15],
			[0.036, 0.2],
			[0.035, 0.2],
			[0.038, 0.15],
			[0.0, 0.112],
		],
		glass,
	);
	const wine = lathe(
		[
			[0, 0.113],
			[0.02, 0.117],
			[0.036, 0.145],
			[0, 0.145],
		],
		new THREE.MeshPhysicalMaterial({
			color: 0x5a0d1a,
			roughness: 0.05,
			transmission: 0.4,
			thickness: 0.03,
			transparent: true,
		}),
	);
	g.add(glassMesh, wine);
	return g;
}

function laptop() {
	const g = new THREE.Group();
	const alu = new THREE.MeshStandardMaterial({ color: 0xb9bcc2, metalness: 0.9, roughness: 0.3 });
	const base = box(0.31, 0.012, 0.22, alu, 0.005);
	base.position.y = 0.006;
	const lid = new THREE.Group();
	const lidMesh = box(0.31, 0.21, 0.008, alu, 0.004);
	lidMesh.position.y = 0.105;
	const screen = new THREE.Mesh(
		new THREE.PlaneGeometry(0.29, 0.185),
		new THREE.MeshStandardMaterial({
			color: 0x0b1320,
			emissive: 0x6f8fb8,
			emissiveIntensity: 0.35,
			roughness: 0.2,
		}),
	);
	screen.position.set(0, 0.105, 0.0045);
	lid.add(lidMesh, screen);
	lid.position.set(0, 0.012, -0.105);
	lid.rotation.x = -0.28;
	g.add(base, lid);
	return g;
}

function bookStack(n = 3) {
	const g = new THREE.Group();
	let y = 0;
	for (let i = 0; i < n; i++) {
		const h = 0.025 + Math.random() * 0.015;
		const b = box(
			0.16 + Math.random() * 0.04,
			h,
			0.22,
			new THREE.MeshStandardMaterial({
				color: bookColors[(i * 3) % bookColors.length],
				roughness: 0.7,
			}),
			0.003,
		);
		b.position.y = y + h / 2;
		b.rotation.y = (Math.random() - 0.5) * 0.3;
		y += h;
		g.add(b);
	}
	return g;
}

function flowers(accent: THREE.Color) {
	const g = new THREE.Group();
	const vase = lathe(
		[
			[0, 0],
			[0.035, 0],
			[0.045, 0.06],
			[0.02, 0.14],
			[0.024, 0.16],
			[0, 0.16],
		],
		new THREE.MeshPhysicalMaterial({
			color: 0xdfe8e4,
			roughness: 0.05,
			transmission: 0.8,
			thickness: 0.01,
			transparent: true,
		}),
	);
	g.add(vase);
	const stemMat = new THREE.MeshStandardMaterial({ color: 0x4a6b33 });
	const petal = new THREE.MeshStandardMaterial({
		color: accent.clone().offsetHSL(0, 0.1, 0.15),
		roughness: 0.6,
	});
	for (let i = 0; i < 5; i++) {
		const a = (i / 5) * Math.PI * 2;
		const stem = cyl(0.002, 0.002, 0.18, stemMat, 5);
		stem.position.set(Math.cos(a) * 0.012, 0.22, Math.sin(a) * 0.012);
		stem.rotation.set(Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2);
		const bloom = shadowed(new THREE.Mesh(new THREE.IcosahedronGeometry(0.022, 1), petal));
		bloom.position.set(Math.cos(a) * 0.03, 0.31, Math.sin(a) * 0.03);
		g.add(stem, bloom);
	}
	return g;
}

function sketchbook(accent: THREE.Color) {
	const g = new THREE.Group();
	const cover = box(
		0.21,
		0.012,
		0.28,
		new THREE.MeshStandardMaterial({ color: accent, roughness: 0.8 }),
		0.003,
	);
	cover.position.y = 0.006;
	const page = box(
		0.2,
		0.002,
		0.27,
		new THREE.MeshStandardMaterial({ color: 0xf5f0e4, roughness: 0.9 }),
	);
	page.position.y = 0.013;
	const pencil = cyl(0.004, 0.004, 0.17, new THREE.MeshStandardMaterial({ color: 0xe0b33a }), 6);
	pencil.rotation.z = Math.PI / 2;
	pencil.rotation.y = 0.4;
	pencil.position.set(0.02, 0.018, 0.02);
	g.add(cover, page, pencil);
	return g;
}

function cameraProp() {
	const g = new THREE.Group();
	const body = box(
		0.13,
		0.08,
		0.05,
		new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 }),
		0.01,
	);
	body.position.y = 0.04;
	const lens = cyl(0.03, 0.032, 0.06, metalDark);
	lens.rotation.x = Math.PI / 2;
	lens.position.set(0, 0.04, 0.05);
	const glassFront = cyl(
		0.024,
		0.024,
		0.002,
		new THREE.MeshPhysicalMaterial({ color: 0x223344, roughness: 0, metalness: 0.2, clearcoat: 1 }),
	);
	glassFront.rotation.x = Math.PI / 2;
	glassFront.position.set(0, 0.04, 0.081);
	g.add(body, lens, glassFront);
	return g;
}

function headphones() {
	const g = new THREE.Group();
	const mat = new THREE.MeshStandardMaterial({ color: 0x2c2c30, roughness: 0.5 });
	const band = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.008, 10, 40, Math.PI), mat));
	band.rotation.x = -Math.PI / 2;
	band.position.y = 0.02;
	g.add(band);
	for (const x of [-0.08, 0.08]) {
		const cup = cyl(0.035, 0.035, 0.03, mat, 24);
		cup.position.set(x, 0.018, 0);
		g.add(cup);
	}
	return g;
}

function notebook() {
	const g = new THREE.Group();
	const nb = box(
		0.15,
		0.012,
		0.21,
		new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7 }),
		0.004,
	);
	nb.position.y = 0.006;
	const pen = cyl(0.005, 0.005, 0.14, brass, 8);
	pen.rotation.z = Math.PI / 2;
	pen.position.set(0.1, 0.006, 0);
	pen.rotation.y = 1.4;
	g.add(nb, pen);
	return g;
}

const BIG_PROPS: PropId[] = ['laptop', 'sketchbook', 'books'];

function buildProp(p: PropId, accent: THREE.Color): THREE.Object3D {
	switch (p) {
		case 'coffee':
			return cupAndSaucer(0x3b2314);
		case 'tea':
			return cupAndSaucer(0x9a5a1c);
		case 'wine':
			return wineGlass();
		case 'laptop':
			return laptop();
		case 'books':
			return bookStack();
		case 'flowers':
			return flowers(accent);
		case 'plants': {
			const o = proceduralPlant(0.4, 0xd8d2c4);
			o.scale.setScalar(0.45);
			return o;
		}
		case 'sketchbook':
			return sketchbook(accent);
		case 'camera':
			return cameraProp();
		case 'headphones':
			return headphones();
		case 'notebook':
			return notebook();
	}
}

/**
 * Arranges props on a table top at y = topY. The sitter is on the -Z side of
 * the table looking towards +Z: one "big" item goes right in front of them,
 * the rest take slots around it.
 */
export function tableProps(props: PropId[], topY: number, accent: THREE.Color, scale = 1) {
	const g = new THREE.Group();
	const ordered = [...props].sort(
		(a, b) => Number(BIG_PROPS.includes(b)) - Number(BIG_PROPS.includes(a)),
	);
	const smallSlots: [number, number, number][] = [
		[0.15, -0.14, -0.4],
		[-0.2, 0.04, 0.5],
		[0.1, 0.2, 0.2],
		[-0.08, -0.18, 0.9],
	];
	let usedCentre = false;
	for (const p of ordered.slice(0, 4)) {
		const o = buildProp(p, accent);
		if (BIG_PROPS.includes(p) && !usedCentre) {
			usedCentre = true;
			o.position.set(0, topY, -0.1 * scale);
			o.rotation.y = Math.PI; // face the sitter
		} else {
			const slot = smallSlots.shift();
			if (!slot) break;
			o.position.set(slot[0] * scale, topY, slot[1] * scale);
			o.rotation.y = slot[2];
		}
		g.add(o);
	}
	return g;
}
