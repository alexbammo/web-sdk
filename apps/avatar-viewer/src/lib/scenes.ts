import * as THREE from 'three';
import { PH, pbrMaterial } from './polyhaven';
import {
	armchair,
	bistroChair,
	bookshelf,
	box,
	pendantLamp,
	proceduralPlant,
	railing,
	rectTable,
	roundTable,
	shadowed,
	steelWindow,
	stringLights,
	tableLamp,
	tableProps,
} from './sceneKit';
import { practicalColor } from './lighting';
import type { SceneDirection, SceneId, TimeOfDay } from './types';

// Every scene shares one layout contract: the hero table sits at the origin,
// the avatar sits on its -Z side facing +Z, and the camera starts on +Z.

export const SITTER_Z = -0.58;

export interface Practical {
	light: THREE.Light;
	base: number;
	bulb?: THREE.Mesh;
}

export interface BuiltScene {
	root: THREE.Group;
	tableTopY: number;
	practicals: Practical[];
	/** Outdoor scenes project the HDRI onto a ground dome. */
	outdoor: boolean;
	/** Multiplier on environment light (interiors see less sky). */
	envScale: number;
	hdri: readonly string[];
	/** Sun azimuth override so light falls through this scene's windows. */
	sunAzimuth?: number;
	cameraStart: THREE.Vector3;
}

export const SCENE_LABELS: Record<SceneId, string> = {
	cafe: 'Neighbourhood café',
	veranda: 'Garden veranda',
	loft: 'Studio loft',
	library: 'Reading room',
	rooftop: 'City rooftop',
};

export const TIME_LABELS: Record<TimeOfDay, string> = {
	morning: 'Morning',
	midday: 'Midday',
	golden: 'Golden hour',
	dusk: 'Dusk',
	night: 'Night',
};

function hdriFor(time: TimeOfDay): readonly string[] {
	return PH.hdri[time];
}

function collectPracticals(root: THREE.Object3D): Practical[] {
	const out: Practical[] = [];
	root.traverse((o) => {
		if (o.userData.practical) out.push(...(o.userData.practical as Practical[]));
	});
	return out;
}

function floor(w: number, d: number, mat: THREE.Material) {
	const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
	m.rotation.x = -Math.PI / 2;
	m.receiveShadow = true;
	return m;
}

/** A wall along X, optionally with rectangular openings: [x centre, width, sill, height]. */
function wall(
	w: number,
	h: number,
	mat: THREE.Material,
	openings: [number, number, number, number][] = [],
	thickness = 0.12,
) {
	const shape = new THREE.Shape();
	shape.moveTo(-w / 2, 0);
	shape.lineTo(w / 2, 0);
	shape.lineTo(w / 2, h);
	shape.lineTo(-w / 2, h);
	shape.closePath();
	for (const [cx, ow, sill, oh] of openings) {
		const hole = new THREE.Path();
		hole.moveTo(cx - ow / 2, sill);
		hole.lineTo(cx + ow / 2, sill);
		hole.lineTo(cx + ow / 2, sill + oh);
		hole.lineTo(cx - ow / 2, sill + oh);
		hole.closePath();
		shape.holes.push(hole);
	}
	const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
	// ExtrudeGeometry UVs are in shape units (metres) – good for tiling textures.
	return shadowed(new THREE.Mesh(geo, mat));
}

function heroSet(dir: SceneDirection, topMat: THREE.Material, round = true) {
	const accent = new THREE.Color(dir.accentColor);
	const g = new THREE.Group();
	const table = round ? roundTable(topMat) : rectTable(topMat, 1.2, 0.72);
	g.add(table);
	const topY = table.userData.topY as number;
	g.add(tableProps(dir.props, topY, accent, round ? 1 : 1.3));
	return { group: g, topY, accent };
}

// ---------------- scenes ----------------

function cafe(dir: SceneDirection): BuiltScene {
	const root = new THREE.Group();
	const W = 9;
	const D = 8;
	const H = 3.4;
	root.add(floor(W, D, pbrMaterial(PH.tex.woodFloor, { color: 0x7a5236, repeat: [4, 4] })));

	const brick = pbrMaterial(PH.tex.brick, { color: 0x8a4a36, repeat: [0.5, 0.5] });
	const plaster = pbrMaterial(PH.tex.plaster, {
		color: 0xe6dccb,
		repeat: [0.4, 0.4],
		tint: 0xf3e9d8,
	});
	const back = wall(W, H, brick);
	back.position.set(0, 0, -D / 2);
	root.add(back);
	// Left wall with two tall windows – the sun comes through these.
	const left = wall(D, H, plaster, [
		[-1.6, 1.5, 0.7, 2.1],
		[0.6, 1.5, 0.7, 2.1],
	]);
	left.rotation.y = Math.PI / 2;
	left.position.set(-W / 2, 0, 0);
	root.add(left);
	for (const z of [1.6, -0.6]) {
		const win = steelWindow(1.5, 2.1, 3, 3);
		win.rotation.y = Math.PI / 2;
		win.position.set(-W / 2 + 0.06, 0.7, z);
		root.add(win);
	}
	const right = wall(D, H, plaster);
	right.rotation.y = -Math.PI / 2;
	right.position.set(W / 2, 0, 0);
	root.add(right);
	const ceiling = floor(W, D, new THREE.MeshStandardMaterial({ color: 0x2a2521, roughness: 0.9 }));
	ceiling.rotation.x = Math.PI / 2;
	ceiling.position.y = H;
	root.add(ceiling);

	// counter along the back wall
	const counterWood = pbrMaterial(PH.tex.tableWood, { color: 0x5b3a24, repeat: [2, 1] });
	const counter = box(3.6, 1.05, 0.7, counterWood, 0.01);
	counter.position.set(1.8, 0.525, -D / 2 + 0.8);
	const counterTop = box(
		3.7,
		0.04,
		0.76,
		pbrMaterial(PH.tex.marble, { color: 0xe9e6e0, repeat: [2, 1] }),
	);
	counterTop.position.set(1.8, 1.07, -D / 2 + 0.8);
	const machine = box(
		0.7,
		0.45,
		0.45,
		new THREE.MeshStandardMaterial({ color: 0xb8b8bc, metalness: 1, roughness: 0.25 }),
		0.03,
	);
	machine.position.set(1.4, 1.32, -D / 2 + 0.8);
	root.add(counter, counterTop, machine);

	const topMat = pbrMaterial(PH.tex.marble, { color: 0xf1eee9, repeat: [1, 1], roughness: 0.3 });
	const { group, topY, accent } = heroSet(dir, topMat);
	root.add(group);
	const chairFrame = new THREE.MeshStandardMaterial({
		color: 0x1b1b1b,
		metalness: 0.7,
		roughness: 0.4,
	});
	const seat = pbrMaterial(PH.tex.leather, { color: accent, tint: accent });
	const chairA = bistroChair(chairFrame, seat);
	chairA.position.set(0, 0, SITTER_Z - 0.05);
	const chairB = bistroChair(chairFrame, seat);
	chairB.position.set(0.1, 0, 0.62);
	chairB.rotation.y = Math.PI + 0.3;
	root.add(chairA, chairB);

	// background tables for depth
	for (const [x, z] of [
		[-2.6, -2.2],
		[2.6, 1.4],
		[-2.8, 2.4],
	]) {
		const t = roundTable(topMat);
		t.position.set(x, 0, z);
		const c = bistroChair(chairFrame, seat);
		c.position.set(x + 0.1, 0, z - 0.6);
		root.add(t, c);
	}

	const warm = practicalColor(dir.warmth);
	for (const [x, z] of [
		[0, 0],
		[-2.6, -2.2],
		[2.6, 1.4],
		[1.8, -D / 2 + 0.8],
	]) {
		const p = pendantLamp(warm, 1, H - 2.05);
		p.position.set(x, H, z);
		root.add(p);
	}
	const plant = proceduralPlant(1.4);
	plant.position.set(-W / 2 + 0.5, 0, -D / 2 + 0.6);
	const plant2 = proceduralPlant(1.1, 0x3b3b3b, 7);
	plant2.position.set(W / 2 - 0.6, 0, 2.8);
	root.add(plant, plant2);

	return {
		root,
		tableTopY: topY,
		practicals: collectPracticals(root),
		outdoor: false,
		envScale: 0.45,
		hdri: hdriFor(dir.timeOfDay),
		sunAzimuth: 270, // from -X, through the left windows
		cameraStart: new THREE.Vector3(1.3, 1.45, 2.1),
	};
}

function veranda(dir: SceneDirection): BuiltScene {
	const root = new THREE.Group();
	const W = 7;
	const D = 5;
	const deckMat = pbrMaterial(PH.tex.deck, { color: 0x8b6a4a, repeat: [3, 3] });
	const deck = box(W, 0.2, D, deckMat);
	deck.position.y = -0.1;
	root.add(deck);
	const wood = pbrMaterial(PH.tex.tableWood, { color: 0xe9e2d5, repeat: [1, 1], tint: 0xf4efe6 });

	// railing on three sides, open at the back where the house would be
	const front = railing(W, wood);
	front.position.z = D / 2 - 0.05;
	const sideL = railing(D, wood);
	sideL.rotation.y = Math.PI / 2;
	sideL.position.x = -W / 2 + 0.05;
	const sideR = sideL.clone();
	sideR.position.x = W / 2 - 0.05;
	root.add(front, sideL, sideR);

	// house wall behind
	const house = wall(
		W + 2,
		3.2,
		pbrMaterial(PH.tex.plaster, { color: 0xefe7da, repeat: [0.4, 0.4], tint: 0xf6efe3 }),
		[
			[-1.2, 1.1, 0, 2.3],
			[1.6, 1.4, 0.9, 1.4],
		],
	);
	house.position.set(0, 0, -D / 2 - 0.1);
	root.add(house);

	// pergola – the beams throw striped shadows across the table
	const postH = 2.7;
	for (const [x, z] of [
		[-W / 2 + 0.15, D / 2 - 0.15],
		[W / 2 - 0.15, D / 2 - 0.15],
		[-W / 2 + 0.15, -D / 2 + 0.15],
		[W / 2 - 0.15, -D / 2 + 0.15],
	]) {
		const post = box(0.14, postH, 0.14, wood);
		post.position.set(x, postH / 2, z);
		root.add(post);
	}
	for (const z of [D / 2 - 0.15, -D / 2 + 0.15]) {
		const beam = box(W, 0.18, 0.1, wood);
		beam.position.set(0, postH, z);
		root.add(beam);
	}
	for (let x = -W / 2 + 0.3; x <= W / 2 - 0.2; x += 0.42) {
		const rafter = box(0.06, 0.14, D + 0.3, wood);
		rafter.position.set(x, postH + 0.14, 0);
		root.add(rafter);
	}

	const topMat = pbrMaterial(PH.tex.tableWood, { color: 0x9a7453, repeat: [1, 1] });
	const { group, topY, accent } = heroSet(dir, topMat);
	root.add(group);
	const frame = new THREE.MeshStandardMaterial({ color: 0x31302c, metalness: 0.4, roughness: 0.5 });
	const cushion = pbrMaterial(PH.tex.fabric, { color: accent, tint: accent });
	const chairA = bistroChair(frame, cushion);
	chairA.position.set(0, 0, SITTER_Z - 0.05);
	root.add(chairA);
	const lounge = armchair(cushion);
	lounge.position.set(1.6, 0, 0.5);
	lounge.rotation.y = -Math.PI / 2 - 0.4;
	root.add(lounge);

	const warm = practicalColor(dir.warmth);
	const y = postH - 0.1;
	root.add(
		stringLights(
			new THREE.Vector3(-W / 2 + 0.15, y, D / 2 - 0.15),
			new THREE.Vector3(W / 2 - 0.15, y, -D / 2 + 0.15),
			warm,
			1,
		),
		stringLights(
			new THREE.Vector3(W / 2 - 0.15, y, D / 2 - 0.15),
			new THREE.Vector3(-W / 2 + 0.15, y, -D / 2 + 0.15),
			warm,
			1,
		),
	);
	for (const [x, z, h] of [
		[-W / 2 + 0.5, D / 2 - 0.5, 1.2],
		[W / 2 - 0.5, D / 2 - 0.5, 0.9],
		[-W / 2 + 0.6, -D / 2 + 0.5, 1.5],
		[2.8, -1.8, 1.0],
	]) {
		const p = proceduralPlant(h, 0xb4643c, Math.round(x * 13 + z * 7 + 20));
		p.position.set(x, 0, z);
		root.add(p);
	}

	return {
		root,
		tableTopY: topY,
		practicals: collectPracticals(root),
		outdoor: true,
		envScale: 1,
		hdri: hdriFor(dir.timeOfDay),
		cameraStart: new THREE.Vector3(1.6, 1.5, 2.2),
	};
}

function loft(dir: SceneDirection): BuiltScene {
	const root = new THREE.Group();
	const W = 10;
	const D = 8;
	const H = 4.2;
	root.add(floor(W, D, pbrMaterial(PH.tex.concrete, { color: 0x8c8a86, repeat: [3, 3] })));
	const brick = pbrMaterial(PH.tex.brick, { color: 0x8a4a36, repeat: [0.5, 0.5] });
	const back = wall(W, H, brick);
	back.position.set(0, 0, -D / 2);
	const right = wall(D, H, brick);
	right.rotation.y = -Math.PI / 2;
	right.position.set(W / 2, 0, 0);
	root.add(back, right);
	// full-height steel window wall on the left
	const glassWall = wall(
		D,
		H,
		new THREE.MeshStandardMaterial({ color: 0x1d1d1f }),
		[[0, D - 0.4, 0.4, H - 0.8]],
		0.08,
	);
	glassWall.rotation.y = Math.PI / 2;
	glassWall.position.set(-W / 2, 0, 0);
	root.add(glassWall);
	const win = steelWindow(D - 0.4, H - 0.8, 8, 4);
	win.rotation.y = Math.PI / 2;
	win.position.set(-W / 2 + 0.05, 0.4, 0);
	root.add(win);
	const ceiling = floor(W, D, new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.95 }));
	ceiling.rotation.x = Math.PI / 2;
	ceiling.position.y = H;
	root.add(ceiling);
	for (let z = -D / 2 + 1; z < D / 2; z += 1.6) {
		const beam = box(
			W,
			0.3,
			0.2,
			new THREE.MeshStandardMaterial({ color: 0x2a2a2c, metalness: 0.6, roughness: 0.5 }),
		);
		beam.position.set(0, H - 0.15, z);
		root.add(beam);
	}

	const topMat = pbrMaterial(PH.tex.tableWood, { color: 0xb08a62, repeat: [1.5, 1] });
	const { group, topY, accent } = heroSet(dir, topMat, false);
	root.add(group);
	const chair = bistroChair(
		new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.6, roughness: 0.4 }),
		pbrMaterial(PH.tex.leather, { color: accent, tint: accent }),
	);
	chair.position.set(0, 0, SITTER_Z - 0.05);
	root.add(chair);
	const sofa = armchair(pbrMaterial(PH.tex.fabric, { color: 0x9a9388, tint: 0xd8d2c8 }));
	sofa.position.set(2.4, 0, 1.2);
	sofa.rotation.y = -2.2;
	root.add(sofa);
	const shelf = bookshelf(2.2, 2.2, pbrMaterial(PH.tex.tableWood, { color: 0x6b4a30 }), 5);
	shelf.position.set(1.8, 0, -D / 2 + 0.3);
	root.add(shelf);
	for (const [x, z, h] of [
		[-W / 2 + 0.8, -D / 2 + 0.8, 1.8],
		[-W / 2 + 0.8, 2.5, 1.2],
	]) {
		const p = proceduralPlant(h, 0xe8e2d8, Math.round(h * 17));
		p.position.set(x, 0, z);
		root.add(p);
	}
	const warm = practicalColor(dir.warmth);
	for (const x of [-0.35, 0.35]) {
		const p = pendantLamp(warm, 0.8, H - 1.9);
		p.position.set(x, H, 0);
		root.add(p);
	}

	return {
		root,
		tableTopY: topY,
		practicals: collectPracticals(root),
		outdoor: false,
		envScale: 0.6,
		hdri: hdriFor(dir.timeOfDay),
		sunAzimuth: 270,
		cameraStart: new THREE.Vector3(1.4, 1.5, 2.3),
	};
}

function library(dir: SceneDirection): BuiltScene {
	const root = new THREE.Group();
	const W = 8;
	const D = 7;
	const H = 3.6;
	root.add(floor(W, D, pbrMaterial(PH.tex.woodFloor, { color: 0x5a3a24, repeat: [4, 4] })));
	const panel = pbrMaterial(PH.tex.tableWood, { color: 0x4a2f1e, repeat: [1, 1] });
	const plaster = pbrMaterial(PH.tex.plaster, {
		color: 0x6e5a48,
		repeat: [0.4, 0.4],
		tint: 0x8a7560,
	});
	const back = wall(W, H, plaster);
	back.position.set(0, 0, -D / 2);
	const right = wall(D, H, plaster);
	right.rotation.y = -Math.PI / 2;
	right.position.set(W / 2, 0, 0);
	const left = wall(D, H, plaster, [[0, 1.4, 0.9, 2.2]]);
	left.rotation.y = Math.PI / 2;
	left.position.set(-W / 2, 0, 0);
	const win = steelWindow(1.4, 2.2, 2, 4);
	win.rotation.y = Math.PI / 2;
	win.position.set(-W / 2 + 0.06, 0.9, 0);
	root.add(back, right, left, win);
	const ceiling = floor(W, D, new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 0.9 }));
	ceiling.rotation.x = Math.PI / 2;
	ceiling.position.y = H;
	root.add(ceiling);

	// shelves along the back and right walls
	for (let i = 0; i < 4; i++) {
		const s = bookshelf(1.8, 3.2, panel, i + 1);
		s.position.set(-2.7 + i * 1.82, 0, -D / 2 + 0.3);
		root.add(s);
	}
	for (let i = 0; i < 3; i++) {
		const s = bookshelf(1.8, 3.2, panel, i + 11);
		s.rotation.y = -Math.PI / 2;
		s.position.set(W / 2 - 0.3, 0, -2 + i * 1.82);
		root.add(s);
	}

	const topMat = pbrMaterial(PH.tex.tableWood, { color: 0x3e2618, repeat: [1.5, 1] });
	const { group, topY, accent } = heroSet(dir, topMat, false);
	root.add(group);
	const warm = practicalColor(dir.warmth);
	const lamp = tableLamp(warm, 1);
	lamp.position.set(-0.45, topY, -0.1);
	root.add(lamp);
	const leather = pbrMaterial(PH.tex.leather, { color: accent, tint: accent });
	const chair = armchair(leather);
	chair.position.set(0, 0, SITTER_Z - 0.15);
	chair.scale.setScalar(0.9);
	root.add(chair);
	const reading = armchair(leather);
	reading.position.set(2.3, 0, 1.6);
	reading.rotation.y = -2.4;
	root.add(reading);
	const floorLamp = tableLamp(warm, 1.3);
	floorLamp.scale.setScalar(4.5);
	floorLamp.position.set(2.9, 0, 0.9);
	root.add(floorLamp);
	const rug = new THREE.Mesh(
		new THREE.PlaneGeometry(3.2, 2.2),
		pbrMaterial(PH.tex.fabric, { color: 0x6b2d2d, repeat: [2, 2], tint: 0x8a4a3a }),
	);
	rug.rotation.x = -Math.PI / 2;
	rug.position.set(0.6, 0.004, 0.3);
	rug.receiveShadow = true;
	root.add(rug);

	return {
		root,
		tableTopY: topY,
		practicals: collectPracticals(root),
		outdoor: false,
		envScale: 0.3,
		hdri: hdriFor(dir.timeOfDay),
		sunAzimuth: 270,
		cameraStart: new THREE.Vector3(1.2, 1.4, 2.0),
	};
}

function rooftop(dir: SceneDirection): BuiltScene {
	const root = new THREE.Group();
	const W = 9;
	const D = 7;
	const slab = box(W, 0.3, D, pbrMaterial(PH.tex.tiles, { color: 0x6e6a66, repeat: [5, 4] }));
	slab.position.y = -0.15;
	root.add(slab);
	const glassPanel = new THREE.MeshPhysicalMaterial({
		color: 0xdfeff5,
		roughness: 0.05,
		transmission: 1,
		thickness: 0.02,
		transparent: true,
		opacity: 0.35,
	});
	const cap = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, metalness: 0.9, roughness: 0.3 });
	const edges: [number, number, number, number][] = [
		[0, D / 2, W, 0],
		[-W / 2, 0, D, Math.PI / 2],
		[W / 2, 0, D, Math.PI / 2],
	];
	for (const [x, z, len, rot] of edges) {
		const g = new THREE.Group();
		const pane = new THREE.Mesh(new THREE.BoxGeometry(len, 1.05, 0.02), glassPanel);
		pane.position.y = 0.55;
		const rail = box(len, 0.05, 0.07, cap);
		rail.position.y = 1.08;
		g.add(pane, rail);
		g.position.set(x, 0, z);
		g.rotation.y = rot;
		root.add(g);
	}
	// planters along the back
	const planterMat = pbrMaterial(PH.tex.concrete, { color: 0x4a4744, repeat: [1, 0.3] });
	for (let x = -W / 2 + 1; x < W / 2; x += 2.2) {
		const planter = box(1.8, 0.5, 0.5, planterMat, 0.02);
		planter.position.set(x, 0.25, -D / 2 + 0.4);
		root.add(planter);
		const p = proceduralPlant(1.2, 0x333333, Math.round(x * 11 + 40));
		p.position.set(x, 0.2, -D / 2 + 0.4);
		root.add(p);
	}

	const topMat = pbrMaterial(PH.tex.marble, { color: 0x2a2a2a, repeat: [1, 1], tint: 0x555555 });
	const { group, topY, accent } = heroSet(dir, topMat);
	root.add(group);
	const frame = new THREE.MeshStandardMaterial({ color: 0xc8a25a, metalness: 1, roughness: 0.3 });
	const seat = pbrMaterial(PH.tex.fabric, { color: accent, tint: accent });
	const chair = bistroChair(frame, seat);
	chair.position.set(0, 0, SITTER_Z - 0.05);
	root.add(chair);
	const lounge = armchair(seat);
	lounge.position.set(-1.9, 0, 0.8);
	lounge.rotation.y = 2.3;
	root.add(lounge);

	const warm = practicalColor(dir.warmth);
	const poleMat = new THREE.MeshStandardMaterial({
		color: 0x1b1b1b,
		metalness: 0.8,
		roughness: 0.4,
	});
	const poles: THREE.Vector3[] = [
		new THREE.Vector3(-W / 2 + 0.3, 2.6, D / 2 - 0.3),
		new THREE.Vector3(W / 2 - 0.3, 2.6, D / 2 - 0.3),
		new THREE.Vector3(W / 2 - 0.3, 2.6, -D / 2 + 0.3),
		new THREE.Vector3(-W / 2 + 0.3, 2.6, -D / 2 + 0.3),
	];
	for (const p of poles) {
		const pole = box(0.06, 2.6, 0.06, poleMat);
		pole.position.set(p.x, 1.3, p.z);
		root.add(pole);
	}
	root.add(
		stringLights(poles[0], poles[2], warm, 1, 18),
		stringLights(poles[1], poles[3], warm, 1, 18),
		stringLights(poles[3], poles[2], warm, 1, 14),
	);

	return {
		root,
		tableTopY: topY,
		practicals: collectPracticals(root),
		outdoor: true,
		envScale: 1,
		hdri:
			dir.timeOfDay === 'night' || dir.timeOfDay === 'dusk'
				? PH.hdri.night
				: hdriFor(dir.timeOfDay),
		cameraStart: new THREE.Vector3(1.5, 1.45, 2.2),
	};
}

const BUILDERS: Record<SceneId, (dir: SceneDirection) => BuiltScene> = {
	cafe,
	veranda,
	loft,
	library,
	rooftop,
};

export function buildScene(dir: SceneDirection): BuiltScene {
	return BUILDERS[dir.scene](dir);
}
