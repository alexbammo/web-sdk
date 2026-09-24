// Autonomous co-op player used for automated end-to-end tests (?bot=1) and for filling empty slots.
// It drives the same input interface a human does, so it exercises the real client and server code.
import { distanceField, descend, cellOf, lineOfSight, MAIN_TILL } from '../shared/layout.js';
import { ITEMS, CARRY_SLOTS, slotsFor } from '../shared/items.js';

const EXIT_POINT = { x: 48, z: -4.5 };

export class Bot {
	constructor(game) {
		this.g = game;
		this.fields = new Map();
		this.decideT = 0;
		this.goal = null;
		this.aim = null;
		this.readySent = false;
		this.stuckT = 0;
		this.lastPos = { x: 0, z: 0 };
		this.jiggle = 0;
		this.tick = 0;
		this.note = '';
	}

	field(x, z) {
		const key = cellOf(x, z);
		let f = this.fields.get(key);
		if (!f) {
			f = distanceField(this.g.layout.grid, [key], 260);
			this.fields.set(key, f);
			if (this.fields.size > 24) this.fields.delete(this.fields.keys().next().value);
		}
		return f;
	}

	decide() {
		const g = this.g;
		const s = g.snap;
		const me = g.me;
		this.goal = null;
		this.aim = null;
		this.act = null;
		this.sprint = false;
		if (!s || !g.id) return;
		if (s.ph === 'lobby') {
			const mine = s.P.find((p) => p.id === g.id);
			if (mine && !mine.rd) g.send({ t: 'ready', v: true });
			return;
		}
		if (s.ph === 'ended' || me.downed || me.escaped) return;
		const P = s.P.filter((p) => !p.dn && !p.es);
		const mine = s.P.find((p) => p.id === g.id);
		if (!mine) return;
		const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
		const itemById = (id) => g.items.find((i) => i.id === id);

		if (s.ph === 'opening') {
			// mill about near the entrance like everyone else
			const k = mine.sl;
			this.goal = { x: 40 + k * 5, z: 16, near: 2 };
			return;
		}

		// ---- threats: keep the torch on ghosts, stare down mannequins ----
		const hostiles = s.E.filter((e) => e.ty === 'ghost' && e.st === 'hostile' && d(e, me) < 13);
		hostiles.sort((a, b) => d(a, me) - d(b, me));
		const mannequins = s.E.filter((e) => e.ty === 'mannequin' && d(e, me) < 9 && lineOfSight(g.layout.solids, me.x, me.z, e.x, e.z));
		mannequins.sort((a, b) => d(a, me) - d(b, me));
		const chasers = s.E.filter((e) => (e.ty === 'zombie' || (e.ty === 'security' && e.st === 'chase')) && d(e, me) < 7);
		if ((me.battery ?? 100) > 0) me.torch = true;
		if (hostiles.length) this.aim = hostiles[0];
		else if (mannequins.length && d(mannequins[0], me) < 6) this.aim = mannequins[0];
		else if (chasers.length) {
			chasers.sort((a, b) => d(a, me) - d(b, me));
			if (d(chasers[0], me) < 5) this.aim = chasers[0];
		}
		if (chasers.length) this.sprint = true;

		// ---- revive: nearest standing player goes ----
		const downed = s.P.filter((p) => p.dn);
		for (const q of downed) {
			const helpers = P.slice().sort((a, b) => d(a, q) - d(b, q));
			if (helpers[0]?.id === g.id || (helpers[1]?.id === g.id && d(me, q) < 20)) {
				this.goal = { x: q.x, z: q.z, near: 1.2 };
				if (d(me, q) < 2.0) this.act = 'hold';
				this.note = 'revive ' + q.n;
				return;
			}
		}

		if (s.ph === 'finale') {
			// escort bulky carriers? nothing left to carry - just run for the doors
			this.goal = { ...EXIT_POINT, near: 0.8 };
			this.sprint = true;
			this.note = 'escape';
			return;
		}

		const listed = (id) => {
			const it = itemById(id);
			return it && s.list.includes(it.type);
		};
		const myItems = (me.carrying || []).filter(listed);
		const used = (me.carrying || []).reduce((a, id) => a + slotsFor(itemById(id)?.type), 0);
		const remaining = g.items.filter((i) => s.list.includes(i.type) && (i.st === 'shelf' || i.st === 'dropped' || i.st === 'caged'));

		// ---- escort a teammate carrying something bulky ----
		for (const q of P) {
			if (q.id === g.id) continue;
			const bulky = q.c.some((id) => ITEMS[itemById(id)?.type]?.quirk === 'bulky');
			if (!bulky) continue;
			const free = P.filter((p) => p.id !== q.id && !p.c.some((id) => ITEMS[itemById(id)?.type]?.quirk === 'bulky'));
			free.sort((a, b) => d(a, q) - d(b, q));
			if (free[0]?.id === g.id) {
				const fx = -Math.sin(q.ry),
					fz = -Math.cos(q.ry);
				this.goal = { x: q.x - fx * 1.2 + fz * 0.9, z: q.z - fz * 1.2 - fx * 0.9, near: 1.2 };
				this.sprint = d(me, q) > 3;
				this.note = 'escort ' + q.n;
				return;
			}
		}

		// ---- claim items greedily (same algorithm runs on every bot) ----
		const claimers = P.filter((p) => p.c.reduce((a, id) => a + slotsFor(itemById(id)?.type), 0) < CARRY_SLOTS);
		const pairs = [];
		for (const p of claimers) for (const it of remaining) pairs.push([d(p, it) + (it.type === 'meat' ? 6 : 0), p.id, it]);
		pairs.sort((a, b) => a[0] - b[0]);
		const takenP = new Set(),
			takenI = new Set();
		let mineIt = null;
		for (const [, pid, it] of pairs) {
			if (takenP.has(pid) || takenI.has(it.id)) continue;
			takenP.add(pid);
			takenI.add(it.id);
			if (pid === g.id) mineIt = it;
		}
		if (mineIt && used + slotsFor(mineIt.type) > CARRY_SLOTS) mineIt = null;

		const lowBattery = (me.battery ?? 100) < 22;
		if (lowBattery && !myItems.length) {
			const bats = g.items.filter((i) => i.type === 'battery' && i.st === 'shelf').sort((a, b) => d(a, me) - d(b, me));
			if (bats[0] && d(bats[0], me) < 30) mineIt = bats[0];
		}

		const tillDist = d(me, MAIN_TILL);
		const goScan = myItems.length && (!mineIt || used >= CARRY_SLOTS || tillDist < d(me, mineIt) * 0.6);
		if (goScan) {
			this.goal = { x: MAIN_TILL.x, z: MAIN_TILL.z - 1.8, near: 0.6 };
			if (tillDist < MAIN_TILL.r) {
				this.act = 'hold';
				this.aim = this.aim || MAIN_TILL;
			}
			this.note = 'scan';
			return;
		}
		if (mineIt) {
			this.note = 'get ' + mineIt.type;
			const dist = d(me, mineIt);
			this.goal = { x: mineIt.x, z: mineIt.z, near: 1.0 };
			if (dist < 1.8) {
				this.aim = this.aim || { x: mineIt.x, z: mineIt.z };
				this.act = mineIt.st === 'caged' ? 'hold' : 'tap';
				this.goal.near = 1.4;
			}
			return;
		}
		// nothing to do: guard the till
		this.goal = { x: MAIN_TILL.x + (mine.sl - 1.5) * 2, z: MAIN_TILL.z + 3, near: 1.5 };
		this.note = 'guard';
	}

	update(dt) {
		const g = this.g;
		const me = g.me;
		const i = g.input;
		this.decideT -= dt;
		this.tick++;
		if (this.decideT <= 0) {
			this.decideT = 0.25;
			this.decide();
		}
		i.fwd = 0;
		i.right = 0;
		i.sprint = false;
		i.interact = false;
		if (!this.goal) return;

		// movement direction from a distance field to the goal
		let dir = null;
		const dist = Math.hypot(this.goal.x - me.x, this.goal.z - me.z);
		if (dist > this.goal.near) {
			if (dist < 1.8 || this.goal.z < 0.5) {
				dir = { x: (this.goal.x - me.x) / dist, z: (this.goal.z - me.z) / dist };
				if (this.goal.z < 0.5 && me.z > 2) dir = descend(g.layout.grid, this.field(this.goal.x, 1.5), me.x, me.z) || dir;
			} else dir = descend(g.layout.grid, this.field(this.goal.x, this.goal.z), me.x, me.z);
			if (!dir) dir = { x: (this.goal.x - me.x) / dist, z: (this.goal.z - me.z) / dist };
		}
		// steer away from anything dangerous nearby
		if (dir && g.snap) {
			let ax = 0,
				az = 0;
			for (const e of g.snap.E) {
				// mannequins are handled by staring at them, not by running away
				const danger = e.ty === 'zombie' || e.ty === 'security' || (e.ty === 'ghost' && e.st === 'hostile');
				if (!danger || (g.phase === 'opening' && e.ty !== 'zombie')) continue;
				const dx = me.x - e.x,
					dz = me.z - e.z;
				const dd = Math.hypot(dx, dz);
				if (dd > 3.5 || dd < 0.01) continue;
				const w = (3.5 - dd) / 3.5;
				ax += (dx / dd) * w * 1.6;
				az += (dz / dd) * w * 1.6;
			}
			if ((ax || az) && this.act !== 'hold') {
				const nx = dir.x + ax,
					nz = dir.z + az;
				const l = Math.hypot(nx, nz) || 1;
				let nd = { x: nx / l, z: nz / l };
				// never let avoidance stall progress: fall back to side-stepping around the threat
				if (nd.x * dir.x + nd.z * dir.z < 0.35) {
					const side = ax * dir.z - az * dir.x > 0 ? 1 : -1;
					nd = { x: dir.x * 0.6 + dir.z * side * 0.8, z: dir.z * 0.6 - dir.x * side * 0.8 };
				}
				dir = nd;
				this.sprint = true;
			}
		}
		// stuck? wiggle sideways
		if (this.tick % 60 === 0) {
			const moved = Math.hypot(me.x - this.lastPos.x, me.z - this.lastPos.z);
			if (dir && moved < 0.3) this.jiggle = 0.6;
			this.lastPos = { x: me.x, z: me.z };
		}
		if (this.jiggle > 0 && dir) {
			this.jiggle -= dt;
			dir = { x: dir.z, z: -dir.x };
		}

		// facing: threat or item, otherwise where we're going
		let face = this.aim ? Math.atan2(-(this.aim.x - me.x), -(this.aim.z - me.z)) : dir ? Math.atan2(-dir.x, -dir.z) : me.yaw;
		let dy = face - me.yaw;
		dy = Math.atan2(Math.sin(dy), Math.cos(dy));
		me.yaw += dy * Math.min(1, dt * 8);
		me.pitch += (-0.12 - me.pitch) * Math.min(1, dt * 4);

		if (dir) {
			// convert world direction to local forward/right
			const sx = -Math.sin(me.yaw),
				sz = -Math.cos(me.yaw);
			const rx = Math.cos(me.yaw),
				rz = -Math.sin(me.yaw);
			i.fwd = dir.x * sx + dir.z * sz;
			i.right = dir.x * rx + dir.z * rz;
			i.sprint = this.sprint && i.fwd > 0.3;
		}
		if (this.act === 'hold') i.interact = true;
		else if (this.act === 'tap') i.interact = this.tick % 20 < 10;
	}
}
