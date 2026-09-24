// Static layout of "St Mercy Superstore" shared by server (AI, collision) and client (rendering).
// Units are metres. X runs left→right looking into the store from the entrance, Z runs from the
// entrance (z = 0) to the back wall (z = D).

export const W = 96;
export const D = 72;
export const CEIL = 7.5;
export const CELL = 0.5;
export const GW = Math.round(W / CELL);
export const GD = Math.round(D / CELL);

// The exit doors sit in the front wall; outside them is the car-park "escape" zone.
export const EXIT = { x0: 44, x1: 52, z: 0 };
export const EXIT_ZONE = { x0: 42, x1: 54, z0: -7, z1: -1.2 };
export const SPAWN = { x: 48, z: 4 };
export const MAIN_TILL = { x: 48, z: 12.5, r: 2.4 };

export const AISLE_NAMES = [
	'Homeware & Candles',
	'Kitchen & Dining',
	'Toys & Games',
	'Baby & Kids',
	'Drinks & Water',
	'Tins & Jars',
	'Cereal & Breakfast',
	'Snacks & Sweets',
	'Household'
];

const GONDOLA_X = Array.from({ length: 10 }, (_, i) => 10 + i * 6);
export const AISLE_X = Array.from({ length: 9 }, (_, i) => 13 + i * 6);
const RUNS = [
	[20, 36],
	[40, 56]
];

// Deterministic RNG for decoration placement so every client builds the same store.
export function rng(seed) {
	let s = seed >>> 0 || 1;
	return () => {
		s ^= s << 13;
		s >>>= 0;
		s ^= s >> 17;
		s ^= s << 5;
		s >>>= 0;
		return s / 4294967296;
	};
}

export function buildLayout() {
	const solids = []; // {x0,z0,x1,z1,h,block:bool(LOS)}
	const props = []; // {m, x, y, z, ry, s:[x,y,z]} models normalised to footprint (see client assets)
	const boxes = []; // procedural boxes {x,y,z,w,h,d,mat}
	const lights = []; // ceiling fixtures {x,z,kind}
	const signs = []; // {x,y,z,ry,text,w,h,color}
	const spots = {}; // item spawn candidates by type
	const add = (k, v) => (spots[k] = spots[k] || []).push(v);
	const r = rng(1337);

	const solid = (x0, z0, x1, z1, h = 2.2, block = true) =>
		solids.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), h, block });

	// --- Outer walls (exit gap in the front wall is closed by shutters until the finale) ---
	const T = 0.6;
	solid(-T, -T, W + T, 0, CEIL); // front wall, carved below
	solids.pop();
	solid(-T, -T, EXIT.x0, 0, CEIL);
	solid(EXIT.x1, -T, W + T, 0, CEIL);
	solid(-T, D, W + T, D + T, CEIL);
	solid(-T, -T, 0, D + T, CEIL);
	solid(W, -T, W + T, D + T, CEIL);

	// --- Main aisles: back-to-back gondolas made of Kenney shelf modules ---
	const shelfModels = ['mini-market/shelf-boxes', 'mini-market/shelf-bags'];
	GONDOLA_X.forEach((gx, gi) => {
		for (const [z0, z1] of RUNS) {
			solid(gx - 1.15, z0 - 0.5, gx + 1.15, z1 + 0.5, 2.1);
			for (let z = z0 + 1; z < z1; z += 2) {
				const m = shelfModels[(gi + Math.floor(z)) % 2];
				props.push({ m, x: gx - 0.58, y: 0, z, ry: -Math.PI / 2, s: [2.0, 2.1, 1.12] });
				props.push({ m, x: gx + 0.58, y: 0, z, ry: Math.PI / 2, s: [2.0, 2.1, 1.12] });
				// item spots on the faces of this gondola, per adjacent aisle
				const left = gi - 1; // aisle on the -x side of this gondola
				const right = gi; // aisle on the +x side
				for (const h of [0.55, 1.05, 1.55]) {
					if (right >= 0 && right < AISLE_NAMES.length) add('aisle' + right, { x: gx + 1.3, y: h, z, face: 1 });
					if (left >= 0 && left < AISLE_NAMES.length) add('aisle' + left, { x: gx - 1.3, y: h, z, face: -1 });
				}
			}
			props.push({ m: 'mini-market/shelf-end', x: gx, y: 0, z: z0 - 0.35, ry: Math.PI, s: [2.3, 1.6, 0.6] });
			props.push({ m: 'mini-market/shelf-end', x: gx, y: 0, z: z1 + 0.35, ry: 0, s: [2.3, 1.6, 0.6] });
		}
	});
	AISLE_X.forEach((ax, i) => {
		for (const [z0, z1] of RUNS)
			signs.push({ x: ax, y: 3.9, z: z0 - 0.5, ry: Math.PI, text: `${i + 1}  ${AISLE_NAMES[i]}`, w: 4.2, h: 0.75, hang: true });
	});

	// --- Left wall shelving (seasonal) ---
	solid(0, 16, 1.4, 58, 2.1);
	for (let z = 17; z < 58; z += 2) props.push({ m: 'mini-market/shelf-boxes', x: 0.7, y: 0, z, ry: Math.PI / 2, s: [2, 2.1, 1.2] });
	for (let z = 17; z < 58; z += 4) add('aisle0', { x: 1.6, y: 1.05, z, face: 1 });
	signs.push({ x: 0.1, y: 3.4, z: 37, ry: Math.PI / 2, text: 'SEASONAL', w: 6, h: 1.1, wall: true });

	// --- Freezer section (right side) ---
	solid(W - 1.3, 18, W, 58, 2.3);
	for (let z = 19; z < 58; z += 2.5)
		props.push({ m: 'mini-market/freezers-standing', x: W - 0.65, y: 0, z, ry: -Math.PI / 2, s: [2.5, 2.3, 1.25] });
	for (const fx of [76, 84]) {
		solid(fx - 1.1, 22, fx + 1.1, 54, 1.0, false);
		for (let z = 23; z < 54; z += 2) {
			props.push({ m: 'mini-market/freezer', x: fx - 0.55, y: 0, z, ry: -Math.PI / 2, s: [2, 1.0, 1.1] });
			props.push({ m: 'mini-market/freezer', x: fx + 0.55, y: 0, z, ry: Math.PI / 2, s: [2, 1.0, 1.1] });
			add('freezer', { x: fx + (z % 4 < 2 ? -0.5 : 0.5), y: 1.0, z, face: 0, reach: 2.2 });
		}
	}
	signs.push({ x: 80, y: 4.2, z: 21, ry: Math.PI, text: 'FROZEN', w: 5, h: 1.1, hang: true, color: '#7fd3ff' });

	// --- Back wall: produce, bakery, deli hot counter, pharmacy ---
	for (let x = 8; x < 40; x += 3.2) {
		const m = x < 26 ? 'mini-market/display-fruit' : 'mini-market/display-bread';
		for (const z of [62.5, 66.5]) {
			solid(x - 0.9, z - 0.9, x + 0.9, z + 0.9, 1.3, false);
			props.push({ m, x, y: 0, z, ry: 0, s: [1.8, 1.3, 1.8] });
		}
	}
	signs.push({ x: 16, y: 4.6, z: 64.5, ry: Math.PI, text: 'FRESH PRODUCE', w: 7, h: 1.1, hang: true, color: '#9be08a' });
	signs.push({ x: 32, y: 4.6, z: 64.5, ry: Math.PI, text: 'BAKERY', w: 5, h: 1.1, hang: true, color: '#ffcf7a' });
	// deli hot counter
	solid(44, 67.5, 64, 69.5, 1.2);
	boxes.push({ x: 54, y: 0.55, z: 68.5, w: 20, h: 1.1, d: 2, mat: 'counter' });
	boxes.push({ x: 54, y: 1.35, z: 68.9, w: 20, h: 0.5, d: 1.1, mat: 'glass' });
	for (let x = 45.5; x < 64; x += 2.5) add('deli', { x, y: 1.15, z: 68.3, face: 0, reach: 2.4 });
	lights.push(...[47, 51, 55, 59, 63].map((x) => ({ x, z: 68.5, y: 2.3, kind: 'heat' })));
	signs.push({ x: 54, y: 3.6, z: D - 0.1, ry: Math.PI, text: 'HOT DELI · ROAST CHICKEN', w: 10, h: 1.1, wall: true, color: '#ff9a4a' });
	boxes.push({ x: 54, y: 1.2, z: 71.4, w: 20, h: 2.4, d: 1.0, mat: 'tiles' });

	// pharmacy enclosure (back right)
	solid(72, 60, 73, 70, 1.2);
	solid(72, 60, 88, 61, 1.2);
	boxes.push({ x: 80, y: 0.6, z: 60.5, w: 16, h: 1.2, d: 1, mat: 'counter' });
	boxes.push({ x: 72.5, y: 0.6, z: 65, w: 1, h: 1.2, d: 10, mat: 'counter' });
	solid(74, 70, 94, D, 2.1);
	for (let x = 75; x < 94; x += 2) {
		props.push({ m: 'mini-market/shelf-boxes', x, y: 0, z: 71.2, ry: Math.PI, s: [2, 2.1, 1.2] });
		add('pharmacy', { x, y: 1.05, z: 69.8, face: 0 });
	}
	signs.push({ x: 83, y: 3.8, z: D - 0.1, ry: Math.PI, text: '✚ PHARMACY', w: 7, h: 1.1, wall: true, color: '#6dffb0' });

	// --- Checkouts (front) ---
	const tills = [];
	for (let x = 10; x <= 70; x += 6) {
		if (Math.abs(x - MAIN_TILL.x) < 4) continue;
		solid(x - 0.6, 9, x + 0.6, 15, 1.0, false);
		boxes.push({ x, y: 0.45, z: 12, w: 1.2, h: 0.9, d: 6, mat: 'counter' });
		boxes.push({ x, y: 0.92, z: 12.6, w: 0.9, h: 0.04, d: 4.4, mat: 'belt' });
		props.push({ m: 'mini-market/cash-register', x: x + 0.1, y: 0.9, z: 10.2, ry: Math.PI / 2, s: [0.9, 0.6, 0.9] });
		tills.push({ x, z: 12 });
		lights.push({ x, z: 10, y: 2.2, kind: 'till' });
	}
	// main self-checkout island
	solid(MAIN_TILL.x - 1.2, MAIN_TILL.z - 0.8, MAIN_TILL.x + 1.2, MAIN_TILL.z + 0.8, 1.1, false);
	boxes.push({ x: MAIN_TILL.x, y: 0.5, z: MAIN_TILL.z, w: 2.4, h: 1.0, d: 1.6, mat: 'selfcheck' });
	props.push({ m: 'mini-market/cash-register', x: MAIN_TILL.x, y: 1.0, z: MAIN_TILL.z, ry: 0, s: [1.0, 0.7, 1.0] });
	signs.push({ x: MAIN_TILL.x, y: 3.0, z: MAIN_TILL.z, ry: Math.PI, text: 'SELF CHECKOUT', w: 3.6, h: 0.7, hang: true, color: '#ffe066', twoSided: true });

	// --- Jewellery kiosk (front right) ---
	const cases = [];
	for (const [x, z] of [
		[76, 6],
		[80, 6],
		[84, 6]
	]) {
		solid(x - 1, z - 0.7, x + 1, z + 0.7, 1.1, false);
		boxes.push({ x, y: 0.45, z, w: 2, h: 0.9, d: 1.4, mat: 'wood' });
		boxes.push({ x, y: 1.1, z, w: 1.9, h: 0.4, d: 1.3, mat: 'glass' });
		cases.push({ x, z });
		add('jewellery', { x, y: 1.0, z, face: 0, reach: 2.2, caseAt: cases.length - 1 });
		lights.push({ x, z, y: 2.4, kind: 'jewel' });
	}
	signs.push({ x: 80, y: 3.4, z: 3, ry: Math.PI, text: 'Ashworth Jewellers', w: 6, h: 0.9, hang: true, color: '#ffd9f0', twoSided: true });

	// --- Entrance lobby dressing ---
	for (let x = 14; x < 40; x += 1.2) props.push({ m: 'mini-market/shopping-cart', x, y: 0, z: 3, ry: Math.PI / 2, s: [0.8, 1.05, 1.25] });
	solid(13, 2.3, 40, 3.7, 1.0, false);
	signs.push({ x: 48, y: 5.6, z: 0.35, ry: 0, text: 'ST MERCY SUPERSTORE', w: 12, h: 1.4, wall: true, color: '#ffffff', key: 'storeName' });
	signs.push({ x: 48, y: 3.2, z: 0.4, ry: 0, text: 'EXIT', w: 2.4, h: 0.6, wall: true, color: '#3dff7a', key: 'exitSign' });

	// structural columns
	for (const [x, z] of [
		[70, 18],
		[70, 38],
		[70, 58],
		[4, 60],
		[4, 14],
		[30, 60],
		[62, 60],
		[88, 14]
	]) {
		solid(x - 0.45, z - 0.45, x + 0.45, z + 0.45, CEIL);
		boxes.push({ x, y: CEIL / 2, z, w: 0.9, h: CEIL, d: 0.9, mat: 'column' });
	}

	// --- Ceiling fluorescent fixtures ---
	for (let x = 7; x < W; x += 6) for (let z = 6; z < D; z += 5) lights.push({ x, z, y: CEIL - 0.25, kind: 'tube' });
	// freezer glow and emergency lights
	for (let z = 20; z < 58; z += 6) lights.push({ x: W - 1.4, z, y: 1.3, kind: 'freezer' });
	for (const [x, z] of [
		[2, 2],
		[94, 2],
		[2, 70],
		[94, 70],
		[41, 1],
		[30, 1],
		[66, 1],
		[48, 71],
		[1, 36],
		[95, 36]
	])
		lights.push({ x, z, y: 3.2, kind: 'emergency' });

	// batteries anywhere on shelves
	for (let i = 0; i < 9; i++) for (const s of spots['aisle' + i]) if (r() < 0.08) add('battery', s);

	// --- Walkable spawn points for AI (open floor) ---
	const grid = buildGrid(solids);
	const open = [];
	for (let gz = 2; gz < GD - 2; gz += 4)
		for (let gx = 2; gx < GW - 2; gx += 4) if (!grid[gz * GW + gx]) open.push({ x: (gx + 0.5) * CELL, z: (gz + 0.5) * CELL });

	return { solids, props, boxes, lights, signs, spots, tills, cases, grid, open };
}

// Navigation grid: 1 = blocked. Solids are inflated by an agent radius.
export function buildGrid(solids, inflate = 0.35) {
	const g = new Uint8Array(GW * GD);
	for (const s of solids) {
		const gx0 = Math.max(0, Math.floor((s.x0 - inflate) / CELL));
		const gx1 = Math.min(GW - 1, Math.floor((s.x1 + inflate) / CELL));
		const gz0 = Math.max(0, Math.floor((s.z0 - inflate) / CELL));
		const gz1 = Math.min(GD - 1, Math.floor((s.z1 + inflate) / CELL));
		for (let z = gz0; z <= gz1; z++) for (let x = gx0; x <= gx1; x++) g[z * GW + x] = 1;
	}
	// border
	for (let x = 0; x < GW; x++) (g[x] = 1), (g[(GD - 1) * GW + x] = 1);
	for (let z = 0; z < GD; z++) (g[z * GW] = 1), (g[z * GW + GW - 1] = 1);
	return g;
}

export const cellOf = (x, z) => {
	const gx = Math.min(GW - 1, Math.max(0, Math.floor(x / CELL)));
	const gz = Math.min(GD - 1, Math.max(0, Math.floor(z / CELL)));
	return gz * GW + gx;
};

// Nearest open cell to a (possibly blocked) cell - used when targets stand next to obstacles.
export function nearestOpen(grid, idx) {
	if (!grid[idx]) return idx;
	const cx = idx % GW,
		cz = (idx / GW) | 0;
	for (let r = 1; r < 8; r++)
		for (let dz = -r; dz <= r; dz++)
			for (let dx = -r; dx <= r; dx++) {
				const x = cx + dx,
					z = cz + dz;
				if (x < 0 || z < 0 || x >= GW || z >= GD) continue;
				if (!grid[z * GW + x]) return z * GW + x;
			}
	return idx;
}

// Distance field over the nav grid (8-connected, no corner cutting) using Dial's bucket queue with
// integer costs 10/14. Returned distances are in cells (float). maxDist is also in cells.
const NB = [
	[1, 0, 10],
	[-1, 0, 10],
	[0, 1, 10],
	[0, -1, 10],
	[1, 1, 14],
	[1, -1, 14],
	[-1, 1, 14],
	[-1, -1, 14]
];
export function distanceField(grid, sources, maxDist = 1e9) {
	const N = GW * GD;
	const di = new Int32Array(N).fill(0x7fffffff);
	const B = 16; // > max edge cost
	const buckets = Array.from({ length: B }, () => []);
	let pending = 0;
	for (const s of sources) {
		const i = nearestOpen(grid, s);
		di[i] = 0;
		buckets[0].push(i);
		pending++;
	}
	const maxI = Math.min(0x7ffffff0, maxDist * 10);
	for (let cur = 0; pending > 0; cur++) {
		const bucket = buckets[cur % B];
		while (bucket.length) {
			const i = bucket.pop();
			pending--;
			const d = di[i];
			if (d !== cur) continue;
			if (d > maxI) continue;
			const x = i % GW,
				z = (i / GW) | 0;
			for (let k = 0; k < 8; k++) {
				const dx = NB[k][0],
					dz = NB[k][1];
				const nx = x + dx,
					nz = z + dz;
				if (nx < 0 || nz < 0 || nx >= GW || nz >= GD) continue;
				const ni = nz * GW + nx;
				if (grid[ni]) continue;
				if (dx && dz && (grid[z * GW + nx] || grid[nz * GW + x])) continue;
				const nd = d + NB[k][2];
				if (nd < di[ni]) {
					di[ni] = nd;
					buckets[nd % B].push(ni);
					pending++;
				}
			}
		}
	}
	const dist = new Float32Array(N);
	for (let i = 0; i < N; i++) dist[i] = di[i] === 0x7fffffff ? Infinity : di[i] / 10;
	return dist;
}

// Direction of steepest descent on a distance field from world position. Returns {x,z} unit or null.
export function descend(grid, dist, x, z) {
	const i = cellOf(x, z);
	const cx = i % GW,
		cz = (i / GW) | 0;
	let best = dist[i],
		bx = 0,
		bz = 0;
	for (let dz = -1; dz <= 1; dz++)
		for (let dx = -1; dx <= 1; dx++) {
			if (!dx && !dz) continue;
			const nx = cx + dx,
				nz = cz + dz;
			if (nx < 0 || nz < 0 || nx >= GW || nz >= GD) continue;
			if (dx && dz && (grid[cz * GW + nx] || grid[nz * GW + cx])) continue;
			const d = dist[nz * GW + nx];
			if (d < best) (best = d), (bx = dx), (bz = dz);
		}
	if (!bx && !bz) return null;
	// steer towards the centre of the chosen cell for smoother motion
	const tx = (cx + bx + 0.5) * CELL - x,
		tz = (cz + bz + 0.5) * CELL - z;
	const l = Math.hypot(tx, tz) || 1;
	return { x: tx / l, z: tz / l };
}

// Line of sight using solids that block vision (shelves, walls). Height-aware: low counters don't block.
export function lineOfSight(solids, ax, az, bx, bz) {
	for (const s of solids) {
		if (!s.block || s.h < 1.6) continue;
		if (segAabb(ax, az, bx, bz, s.x0, s.z0, s.x1, s.z1)) return false;
	}
	return true;
}

function segAabb(ax, az, bx, bz, x0, z0, x1, z1) {
	let t0 = 0,
		t1 = 1;
	const dx = bx - ax,
		dz = bz - az;
	for (const [p, q] of [
		[-dx, ax - x0],
		[dx, x1 - ax],
		[-dz, az - z0],
		[dz, z1 - az]
	]) {
		if (p === 0) {
			if (q < 0) return false;
		} else {
			const t = q / p;
			if (p < 0) {
				if (t > t1) return false;
				if (t > t0) t0 = t;
			} else {
				if (t < t0) return false;
				if (t < t1) t1 = t;
			}
		}
	}
	return true;
}

// Circle vs AABB slide collision used by clients for their own avatar.
export function collide(solids, x, z, r, extra = []) {
	for (let iter = 0; iter < 3; iter++) {
		let moved = false;
		for (const s of solids.concat(extra)) {
			const cx = Math.max(s.x0, Math.min(x, s.x1));
			const cz = Math.max(s.z0, Math.min(z, s.z1));
			const dx = x - cx,
				dz = z - cz;
			const d2 = dx * dx + dz * dz;
			if (d2 < r * r) {
				if (d2 > 1e-8) {
					const d = Math.sqrt(d2);
					x = cx + (dx / d) * r;
					z = cz + (dz / d) * r;
				} else {
					// centre inside the box: push out along the smallest axis
					const pen = [x - s.x0, s.x1 - x, z - s.z0, s.z1 - z];
					const m = pen.indexOf(Math.min(...pen));
					if (m === 0) x = s.x0 - r;
					else if (m === 1) x = s.x1 + r;
					else if (m === 2) z = s.z0 - r;
					else z = s.z1 + r;
				}
				moved = true;
			}
		}
		if (!moved) break;
	}
	return { x, z };
}

// Exit shutters block the doorway until the receipt prints.
export const SHUTTER = { x0: EXIT.x0, z0: -0.6, x1: EXIT.x1, z1: 0, h: CEIL, block: true };
