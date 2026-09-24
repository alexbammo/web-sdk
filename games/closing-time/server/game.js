import {
	buildLayout,
	distanceField,
	descend,
	cellOf,
	lineOfSight,
	collide,
	rng,
	MAIN_TILL,
	EXIT_ZONE,
	SPAWN,
	SHUTTER
} from '../shared/layout.js';
import { ITEMS, LIST_SIZE, CARRY_SLOTS, slotsFor } from '../shared/items.js';

const L = buildLayout();
const TICK = 0.05;
export const OPENING_TIME = 35;
export const FINALE_TIME = 150;
const ENDED_TIME = 20;

// Wander points of interest shared by every roaming enemy.
const POIS = [
	[7, 28], [7, 48], [25, 28], [37, 48], [49, 28], [61, 48], [30, 38], [55, 38],
	[80, 20], [80, 56], [90, 38], [20, 60], [50, 62], [80, 66], [30, 16], [66, 16], [84, 10]
];
const POI_FIELDS = POIS.map(([x, z]) => distanceField(L.grid, [cellOf(x, z)]));
// Security patrol loop: front concourse, cross aisle, back of the aisles
const PATROL = [
	[7, 17.5], [67, 17.5], [67, 38], [7, 38], [7, 58], [67, 58], [67, 38], [7, 38]
];
const PATROL_FIELDS = PATROL.map(([x, z]) => distanceField(L.grid, [cellOf(x, z)]));

const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
const fwd = (ry) => ({ x: -Math.sin(ry), z: -Math.cos(ry) });

let nextId = 1;

export class Room {
	constructor(code, send) {
		this.code = code;
		this.broadcast = send;
		this.players = new Map();
		this.reset();
	}

	reset() {
		this.phase = 'lobby';
		this.phaseT = 0;
		this.seed = (Math.random() * 1e9) | 0;
		this.list = [];
		this.items = [];
		this.itemsV = 1;
		this.enemies = [];
		this.graves = [];
		this.cases = L.cases.map(() => ({ open: false, p: 0 }));
		this.fields = new Map();
		this.fieldT = 0;
		this.noiseFields = new Map();
		this.scans = 0;
		this.stats = { downs: 0, revives: 0, hitsBy: {} };
		this.result = null;
		this.lastSpawnT = 0;
		for (const p of this.players.values()) this.resetPlayer(p);
	}

	resetPlayer(p) {
		Object.assign(p, {
			x: SPAWN.x + (p.slot - 1.5) * 1.5,
			y: 0,
			z: SPAWN.z + 1,
			ry: Math.PI,
			pitch: 0,
			hp: 100,
			downed: false,
			carrying: [],
			hold: null,
			holdP: 0,
			battery: 100,
			torch: false,
			hurtT: 99,
			noiseT: 0,
			ready: p.bot ? p.ready : false,
			escaped: false
		});
	}

	join(ws, name, bot) {
		const used = new Set([...this.players.values()].map((p) => p.slot));
		let slot = 0;
		while (used.has(slot)) slot++;
		if (slot >= 4) return null;
		const p = { id: 'p' + nextId++, name: String(name || 'Shopper').slice(0, 16), slot, ws, bot: !!bot };
		this.resetPlayer(p);
		if (this.phase !== 'lobby' && this.phase !== 'ended') {
			// late joiners arrive at the entrance
			p.torch = this.phase !== 'opening';
		}
		this.players.set(p.id, p);
		this.event({ k: 'announce', text: `${p.name} entered the store` });
		return p;
	}

	leave(p) {
		this.dropAll(p);
		this.players.delete(p.id);
		this.event({ k: 'announce', text: `${p.name} left` });
		if (!this.players.size) this.reset();
	}

	event(e) {
		this.broadcast({ t: 'ev', ...e });
	}

	noise(x, z, r, kind) {
		this.event({ k: 'noise', x, z, r, kind });
		for (const e of this.enemies) {
			if (e.type !== 'zombie' || e.state === 'chase') continue;
			if (dist2(e, { x, z }) < r * r) {
				e.state = 'investigate';
				e.goal = { x, z };
				e.t = 0;
			}
		}
	}

	// ---- messages ----
	onMessage(p, m) {
		switch (m.t) {
			case 'st':
				if (p.downed) {
					p.ry = +m.ry || 0;
					break;
				}
				if (this.phase !== 'finale' && m.z < 0.3) m.z = 0.3; // shutters
				p.x = +m.x;
				p.y = +m.y || 0;
				p.z = +m.z;
				p.ry = +m.ry;
				p.pitch = +m.pitch || 0;
				p.torch = !!m.torch && p.battery > 0;
				p.moving = !!m.mv;
				p.sprint = !!m.sp;
				p.anim = m.an;
				break;
			case 'ready':
				p.ready = !!m.v;
				break;
			case 'start':
				if (this.phase === 'lobby') this.startRun();
				break;
			case 'pickup':
				this.pickup(p, m.id);
				break;
			case 'drop':
				this.dropAll(p, true);
				break;
			case 'debug':
				// test hooks, only enabled with CT_DEBUG=1
				if (!process.env.CT_DEBUG) break;
				if (m.do === 'lockdown' && this.phase === 'opening') this.lockdown();
				if (m.do === 'finale') this.finale();
				if (m.do === 'god') p.invuln = 1e9;
				break;
			case 'hold':
				p.hold = m.v ? { kind: m.kind, target: m.target } : null;
				p.holdP = 0;
				break;
		}
	}

	// ---- flow ----
	startRun() {
		const R = rng(this.seed);
		const pool = Object.keys(ITEMS).filter((k) => k !== 'meat' && k !== 'ring');
		const list = ['meat', 'ring'];
		while (list.length < LIST_SIZE) {
			const k = pool.splice((R() * pool.length) | 0, 1)[0];
			list.push(k);
		}
		this.list = list.sort(() => R() - 0.5);
		this.items = [];
		for (const type of this.list) {
			const cands = L.spots[ITEMS[type].spot];
			const s = cands[(R() * cands.length) | 0];
			this.items.push({
				id: 'i' + nextId++,
				type,
				x: s.x,
				y: s.y,
				z: s.z,
				st: type === 'ring' ? 'caged' : 'shelf',
				holder: null,
				reach: s.reach || 2.2,
				caseAt: s.caseAt
			});
		}
		// a couple of decoys the players don't need - wasted trips are part of the fun
		const bats = [...L.spots.battery].sort(() => R() - 0.5).slice(0, 12);
		for (const s of bats)
			this.items.push({ id: 'b' + nextId++, type: 'battery', x: s.x, y: s.y, z: s.z, st: 'shelf', holder: null, reach: 2.2 });
		this.itemsV++;

		// harmless-looking shoppers and mannequins populate the opening
		this.enemies = [];
		for (let i = 0; i < 8; i++) this.spawn('ghost', this.farPoint(R, 12));
		for (let i = 0; i < 7; i++) {
			const ax = 13 + 6 * ((R() * 9) | 0);
			this.spawn('mannequin', { x: ax + (R() - 0.5) * 1.2, z: 22 + R() * 32 });
		}
		for (const p of this.players.values()) this.resetPlayer(p);
		this.setPhase('opening');
		this.event({ k: 'announce', voice: true, text: 'Welcome to St Mercy Superstore. The store will be closing shortly. Please make your way to the tills.' });
	}

	setPhase(ph) {
		this.phase = ph;
		this.phaseT = 0;
		this.event({ k: 'phase', phase: ph });
	}

	lockdown() {
		this.setPhase('lockdown');
		const R = rng(this.seed + 7);
		const n = 4 + this.players.size;
		for (let i = 0; i < n; i++) this.spawn('zombie', this.farPoint(R, 22));
		const guard = this.spawn('security', { x: 7, z: 58 });
		guard.wp = 4;
		guard.state = 'patrol';
		for (let i = 0; i < 6; i++) this.addGrave(R);
		for (const p of this.players.values()) p.torch = true;
		this.event({
			k: 'blackout',
			voice: true,
			text: 'Attention shoppers. The store is now closed. To leave, please complete your purchase.'
		});
	}

	finale() {
		this.setPhase('finale');
		const R = rng(this.seed + 99);
		for (let i = 0; i < 6; i++) this.spawn('zombie', this.farPoint(R, 30));
		const guard = this.spawn('security', { x: 67, z: 38 });
		guard.wp = 3;
		guard.state = 'patrol';
		for (const e of this.enemies) if (e.type === 'ghost' && e.state === 'shopper') e.state = 'hostile';
		this.event({ k: 'receipt', voice: true, text: 'Thank you for shopping at St Mercy. Your exit is now open. Please do not linger.' });
	}

	end(won) {
		this.result = {
			won,
			time: Math.round(this.runT || 0),
			escaped: [...this.players.values()].filter((p) => p.escaped).map((p) => p.name),
			left: [...this.players.values()].filter((p) => !p.escaped).map((p) => p.name),
			scanned: this.scans,
			...this.stats
		};
		this.setPhase('ended');
		this.event({ k: won ? 'won' : 'lost', result: this.result });
	}

	addGrave(R) {
		const pt = L.open[(R() * L.open.length) | 0];
		this.graves.push({ x: pt.x, z: pt.z, ry: R() * 6.28, v: (R() * 4) | 0 });
		this.itemsV++;
	}

	farPoint(R, minD) {
		for (let tries = 0; tries < 60; tries++) {
			const pt = L.open[(R() * L.open.length) | 0];
			let ok = pt.z > 15;
			for (const p of this.players.values()) if (dist2(p, pt) < minD * minD) ok = false;
			if (ok) return pt;
		}
		return L.open[(R() * L.open.length) | 0];
	}

	spawn(type, pt) {
		const e = {
			id: 'e' + nextId++,
			type,
			x: pt.x,
			z: pt.z,
			ry: Math.random() * 6.28,
			state: type === 'ghost' ? 'shopper' : type === 'zombie' ? 'wander' : 'pose',
			poi: (Math.random() * POIS.length) | 0,
			cd: 0,
			t: 0,
			stun: 0,
			v: (Math.random() * 12) | 0,
			mv: 0
		};
		this.enemies.push(e);
		return e;
	}

	// ---- actions ----
	pickup(p, id) {
		if (p.downed || this.phase === 'lobby' || this.phase === 'ended') return;
		const it = this.items.find((i) => i.id === id);
		if (!it || (it.st !== 'shelf' && it.st !== 'dropped')) return;
		if (dist2(p, it) > (it.reach + 0.3) ** 2) return;
		if (it.type === 'battery') {
			p.battery = Math.min(100, p.battery + 60);
			this.items = this.items.filter((i) => i !== it);
			this.itemsV++;
			this.event({ k: 'battery', pid: p.id });
			return;
		}
		const used = p.carrying.reduce((a, iid) => a + slotsFor(this.items.find((i) => i.id === iid)?.type), 0);
		if (used + slotsFor(it.type) > CARRY_SLOTS) {
			this.event({ k: 'toast', pid: p.id, text: 'Your hands are full - drop something (Q) or scan at the till' });
			return;
		}
		it.st = 'carried';
		it.holder = p.id;
		p.carrying.push(it.id);
		this.itemsV++;
		this.event({ k: 'pickup', pid: p.id, item: it.type });
		if (it.type === 'medicine' && !it.woke) {
			it.woke = true;
			const g = this.spawn('ghost', { x: 83, z: 66 });
			g.state = 'hostile';
			g.v = 100; // pharmacy spirit
			g.t = -10;
			this.event({ k: 'guardian', text: 'Something rises behind the pharmacy counter...' });
		}
		if (this.phase === 'opening' && this.phaseT > 5) this.phaseT = Math.max(this.phaseT, OPENING_TIME - 3);
	}

	dropAll(p, voluntary) {
		if (!p.carrying.length) return;
		p.carrying.forEach((iid, k) => {
			const it = this.items.find((i) => i.id === iid);
			if (!it) return;
			const f = fwd(p.ry);
			const pos = collide(L.solids, p.x + f.x * 0.7 + k * 0.3, p.z + f.z * 0.7, 0.2);
			Object.assign(it, { st: 'dropped', holder: null, x: pos.x, y: 0.05, z: pos.z, reach: 2.2 });
		});
		p.carrying = [];
		this.itemsV++;
		if (!voluntary) this.event({ k: 'dropped', pid: p.id });
	}

	updateHolds(dt) {
		for (const p of this.players.values()) {
			const h = p.hold;
			if (!h || p.downed) {
				p.holdP = 0;
				continue;
			}
			if (h.kind === 'revive') {
				const q = this.players.get(h.target);
				if (!q || !q.downed || dist2(p, q) > 2.6 ** 2) {
					p.holdP = 0;
					continue;
				}
				p.holdP += dt / 3;
				if (p.holdP >= 1) {
					q.downed = false;
					q.hp = 60;
					q.invuln = 4;
					q.hurtT = 0;
					p.hold = null;
					p.holdP = 0;
					this.stats.revives++;
					this.event({ k: 'revived', pid: q.id, by: p.id });
				}
			} else if (h.kind === 'case') {
				const c = this.cases[h.target];
				const cp = L.cases[h.target];
				if (!c || c.open || !cp || dist2(p, cp) > 2.6 ** 2) {
					p.holdP = 0;
					continue;
				}
				p.holdP += dt / 4;
				p.noiseT -= dt;
				if (p.noiseT <= 0) {
					p.noiseT = 1;
					this.noise(cp.x, cp.z, 24, 'glass');
				}
				if (p.holdP >= 1) {
					c.open = true;
					p.hold = null;
					p.holdP = 0;
					for (const it of this.items) if (it.caseAt === h.target && it.st === 'caged') it.st = 'shelf';
					this.itemsV++;
					this.event({ k: 'case', i: h.target });
					if (this.list.includes('ring') && this.items.some((i) => i.caseAt === h.target && i.type === 'ring')) {
						const g = this.spawn('ghost', { x: cp.x + 4, z: cp.z + 8 });
						g.state = 'hostile';
						g.v = 101; // the bride
						g.t = -10;
						this.event({ k: 'guardian', text: 'A bride in a torn veil turns towards the glass...' });
					}
				}
			} else if (h.kind === 'scan') {
				if (dist2(p, MAIN_TILL) > (MAIN_TILL.r + 0.4) ** 2 || (this.phase !== 'lockdown' && this.phase !== 'opening')) {
					p.holdP = 0;
					continue;
				}
				const need = p.carrying.find((iid) => {
					const it = this.items.find((i) => i.id === iid);
					return it && this.list.includes(it.type);
				});
				if (!need) {
					p.holdP = 0;
					continue;
				}
				if (this.phase === 'opening') {
					this.event({ k: 'toast', pid: p.id, text: 'The till is not accepting payments yet...' });
					p.hold = null;
					continue;
				}
				p.holdP += dt / 1.5;
				if (p.holdP >= 1) {
					p.holdP = 0;
					const it = this.items.find((i) => i.id === need);
					it.st = 'scanned';
					it.holder = null;
					p.carrying = p.carrying.filter((i) => i !== need);
					this.scans++;
					this.itemsV++;
					const lines = [
						'Please place the item in the bagging area.',
						'Unexpected item in the bagging area.',
						'Approval needed. Please wait for an assistant.',
						'Item scanned. They are coming.',
						'Thank you. Please take your receipt.'
					];
					const left = this.list.length - this.scans;
					this.event({ k: 'scan', pid: p.id, item: it.type, left, voice: true, text: left ? lines[(this.scans - 1) % 4] : lines[4] });
					this.noise(MAIN_TILL.x, MAIN_TILL.z, 45, 'beep');
					const R = rng(this.seed + this.scans * 31);
					for (let i = 0; i < 2; i++) this.spawn('zombie', this.farPoint(R, 25));
					this.addGrave(R);
					this.addGrave(R);
					if (!left) this.finale();
				}
			}
		}
	}

	// ---- simulation ----
	tick() {
		const dt = TICK;
		this.phaseT += dt;
		const players = [...this.players.values()];
		const alive = players.filter((p) => !p.downed && !p.escaped);

		if (this.phase === 'lobby') {
			if (players.length && players.every((p) => p.ready)) this.startRun();
		} else if (this.phase === 'opening') {
			this.runT = this.phaseT;
			if (this.phaseT >= OPENING_TIME) this.lockdown();
		} else if (this.phase === 'lockdown' || this.phase === 'finale') {
			this.runT += dt;
			if (!alive.length && players.some((p) => !p.escaped)) {
				if (players.some((p) => p.escaped)) this.end(true);
				else this.end(false);
			}
			if (this.phase === 'lockdown' && this.phaseT - this.lastSpawnT > 75) {
				this.lastSpawnT = this.phaseT;
				this.spawn('zombie', this.farPoint(Math.random, 25));
			}
			if (this.phase === 'finale') {
				for (const p of alive)
					if (p.x > EXIT_ZONE.x0 && p.x < EXIT_ZONE.x1 && p.z < EXIT_ZONE.z1 + 0.6) {
						p.escaped = true;
						this.event({ k: 'escaped', pid: p.id });
					}
				const standing = players.filter((p) => !p.downed && !p.escaped);
				if (players.some((p) => p.escaped) && !standing.length) this.end(true);
				else if (this.phaseT >= FINALE_TIME) this.end(players.some((p) => p.escaped));
			}
		} else if (this.phase === 'ended') {
			if (this.phaseT > ENDED_TIME) {
				this.reset();
				for (const p of players) p.ready = false;
			}
		}

		if (this.phase !== 'lobby' && this.phase !== 'ended') {
			this.updateHolds(dt);
			this.updatePlayers(dt, players);
			this.updateEnemies(dt, alive);
		}
		this.send();
	}

	updatePlayers(dt, players) {
		for (const p of players) {
			p.hurtT += dt;
			p.invuln = Math.max(0, (p.invuln || 0) - dt);
			if (!p.downed && p.hurtT > 4 && p.hp < 100) p.hp = Math.min(100, p.hp + 8 * dt);
			if (p.torch && this.phase !== 'opening') p.battery = Math.max(0, p.battery - dt * 0.55);
			if (p.battery <= 0) p.torch = false;
			if (p.moving && !p.downed) {
				for (const iid of p.carrying) {
					const it = this.items.find((i) => i.id === iid);
					if (it && ITEMS[it.type]?.quirk === 'noisy') {
						it.noiseT = (it.noiseT || 0) - dt;
						if (it.noiseT <= 0) {
							it.noiseT = 6;
							this.noise(p.x, p.z, 16, it.type);
						}
					}
				}
				if (p.sprint) {
					p.noiseT -= dt;
					if (p.noiseT <= 0) {
						p.noiseT = 1.5;
						this.noise(p.x, p.z, 7, 'steps');
					}
				}
			}
		}
	}

	fieldFor(p) {
		return this.fields.get(p.id);
	}

	updateEnemies(dt, alive) {
		const phase = this.phase;
		// a short grace period after the blackout lets players find their bearings
		const hostile = (phase === 'lockdown' && this.phaseT > 15) || phase === 'finale';
		const mult = 1 + 0.07 * this.scans + (phase === 'finale' ? 0.18 : 0);
		this.fieldT -= dt;
		if (this.fieldT <= 0 && hostile) {
			this.fieldT = 0.4;
			this.fields.clear();
			for (const p of alive) this.fields.set(p.id, distanceField(L.grid, [cellOf(p.x, p.z)], 140));
		}
		const nearest = (e, maxD = 1e9) => {
			let best = null,
				bd = maxD * maxD;
			for (const p of alive) {
				const d = dist2(e, p);
				if (d < bd) (bd = d), (best = p);
			}
			return best;
		};
		const moveAlong = (e, dir, speed, ghost) => {
			if (!dir) return;
			const nx = e.x + dir.x * speed * dt,
				nz = e.z + dir.z * speed * dt;
			const c = ghost ? { x: nx, z: nz } : collide(L.solids, nx, nz, 0.3);
			e.x = Math.min(95.5, Math.max(0.5, c.x));
			e.z = Math.min(71.5, Math.max(0.5, c.z));
			const want = Math.atan2(-dir.x, -dir.z);
			let d = want - e.ry;
			d = Math.atan2(Math.sin(d), Math.cos(d));
			e.ry += d * Math.min(1, dt * 8);
			e.mv = speed;
		};

		for (const e of this.enemies) {
			e.cd -= dt;
			e.t += dt;
			e.mv = 0;
			if (e.type === 'zombie') {
				if (!hostile) continue;
				const tgt = nearest(e, 12);
				if (tgt) {
					const f = fwd(e.ry);
					const dx = tgt.x - e.x,
						dz = tgt.z - e.z;
					const d = Math.hypot(dx, dz) || 1;
					const facing = (f.x * dx + f.z * dz) / d > -0.3 || d < 4;
					if (facing && e.cd < 3 && lineOfSight(L.solids, e.x, e.z, tgt.x, tgt.z)) {
						e.state = 'chase';
						e.target = tgt.id;
						e.seenT = 0;
					}
				}
				if (e.state === 'chase') {
					const p = this.players.get(e.target);
					e.seenT = (e.seenT || 0) + dt;
					if (!p || p.downed || p.escaped || e.seenT > 7) {
						e.state = p && !p.downed ? 'investigate' : 'wander';
						if (p) e.goal = { x: p.x, z: p.z };
						continue;
					}
					if (dist2(e, p) < 1.1 ** 2) {
						this.attack(e, p, 20);
						continue;
					}
					const fld = this.fields.get(p.id);
					let dir = fld && descend(L.grid, fld, e.x, e.z);
					if (!dir || dist2(e, p) < 4) {
						const l = Math.sqrt(dist2(e, p)) || 1;
						dir = { x: (p.x - e.x) / l, z: (p.z - e.z) / l };
					}
					// torch beams make the dead flinch and slow down
					let lit = false;
					for (const q of alive) {
						if (!q.torch) continue;
						const qx = e.x - q.x,
							qz = e.z - q.z;
						const qd = Math.hypot(qx, qz);
						const f = fwd(q.ry);
						if (qd < 10 && (f.x * qx + f.z * qz) / (qd || 1) > 0.9) lit = true;
					}
					moveAlong(e, dir, (lit ? 1.25 : 2.55) * mult);
				} else if (e.state === 'investigate' && e.goal) {
					const key = cellOf(e.goal.x, e.goal.z);
					let f = this.noiseFields.get(key);
					if (!f || this.phaseT - f.t > 10) {
						f = { t: this.phaseT, d: distanceField(L.grid, [key], 120) };
						this.noiseFields.set(key, f);
						if (this.noiseFields.size > 30) this.noiseFields.delete(this.noiseFields.keys().next().value);
					}
					if (dist2(e, e.goal) < 2 || e.t > 25) {
						e.state = 'wander';
						e.t = 0;
					} else moveAlong(e, descend(L.grid, f.d, e.x, e.z), 1.9 * mult);
				} else {
					const fld = POI_FIELDS[e.poi];
					if (fld[cellOf(e.x, e.z)] < 3 || e.t > 30) {
						e.poi = (Math.random() * POIS.length) | 0;
						e.t = 0;
					}
					moveAlong(e, descend(L.grid, fld, e.x, e.z), 1.1 * mult);
				}
			} else if (e.type === 'ghost') {
				if (e.state === 'banished') {
					if (e.t > 18) {
						const pt = this.farPoint(Math.random, 18);
						Object.assign(e, { x: pt.x, z: pt.z, state: hostile ? 'lurk' : 'shopper', t: 0, stun: 0 });
					}
					continue;
				}
				if (e.state === 'shopper' || e.state === 'lurk') {
					// wander harmlessly like a late-night shopper
					const fld = POI_FIELDS[e.poi];
					if (fld[cellOf(e.x, e.z)] < 3 || e.t > 40) {
						e.poi = (Math.random() * POIS.length) | 0;
						e.t = 0;
					}
					moveAlong(e, descend(L.grid, fld, e.x, e.z), 0.8);
					const p = nearest(e, 3.5);
					if (hostile && p && lineOfSight(L.solids, e.x, e.z, p.x, p.z)) {
						e.state = 'hostile';
						e.t = 0;
						e.target = p.id;
						this.event({ k: 'ghostturn', id: e.id, x: e.x, z: e.z });
					}
					continue;
				}
				// hostile: glide straight through the shelving towards the nearest player
				const p = nearest(e);
				if (!p || e.t > 26) {
					e.state = 'banished';
					e.t = 0;
					continue;
				}
				// torch beams burn ghosts away
				for (const q of alive) {
					if (!q.torch) continue;
					const dx = e.x - q.x,
						dz = e.z - q.z;
					const d = Math.hypot(dx, dz);
					const f = fwd(q.ry);
					if (d < 13 && (f.x * dx + f.z * dz) / (d || 1) > 0.94 && lineOfSight(L.solids, q.x, q.z, e.x, e.z)) e.stun += dt;
				}
				if (e.stun > 1.1) {
					e.state = 'banished';
					e.t = 0;
					this.event({ k: 'banish', id: e.id, x: e.x, z: e.z });
					continue;
				}
				if (e.t < 0) {
					// guardians wait at their post for a moment
					moveAlong(e, null, 0);
					continue;
				}
				if (dist2(e, p) < 1.0) {
					this.attack(e, p, 30);
					if (p.downed || e.cd > 0) {
						e.state = 'banished';
						e.t = 0;
					}
					continue;
				}
				const l = Math.sqrt(dist2(e, p)) || 1;
				moveAlong(e, { x: (p.x - e.x) / l, z: (p.z - e.z) / l }, (e.stun > 0.2 ? 1.4 : 3.1) * mult, true);
			} else if (e.type === 'security') {
				// possessed security: sweeps a torch along a patrol route, chases whoever it catches in the beam
				if (!hostile) continue;
				if (e.state !== 'chase') {
					const f = fwd(e.ry);
					for (const q of alive) {
						const dx = q.x - e.x,
							dz = q.z - e.z;
						const dd = Math.hypot(dx, dz);
						if (dd < 15 && (f.x * dx + f.z * dz) / (dd || 1) > 0.82 && e.cd <= 0 && lineOfSight(L.solids, e.x, e.z, q.x, q.z)) {
							e.state = 'chase';
							e.target = q.id;
							e.t = 0;
							this.event({ k: 'spotted', id: e.id, pid: q.id, x: e.x, z: e.z });
							break;
						}
					}
				}
				if (e.state === 'chase') {
					const p = this.players.get(e.target);
					if (!p || p.downed || p.escaped || e.t > 9) {
						e.state = 'patrol';
						e.cd = Math.max(e.cd, 4);
						continue;
					}
					if (dist2(e, p) < 1.1 ** 2) {
						this.attack(e, p, 30);
						continue;
					}
					const fld = this.fields.get(p.id);
					let dir = fld && descend(L.grid, fld, e.x, e.z);
					if (!dir || dist2(e, p) < 4) {
						const l = Math.sqrt(dist2(e, p)) || 1;
						dir = { x: (p.x - e.x) / l, z: (p.z - e.z) / l };
					}
					moveAlong(e, dir, 3.5 * mult);
				} else {
					const fld = PATROL_FIELDS[e.wp];
					if (fld[cellOf(e.x, e.z)] < 2) e.wp = (e.wp + 1) % PATROL.length;
					moveAlong(e, descend(L.grid, fld, e.x, e.z), 1.5);
				}
			} else if (e.type === 'mannequin') {
				if (!hostile) continue;
				let seen = false;
				for (const q of alive) {
					const dx = e.x - q.x,
						dz = e.z - q.z;
					const d = Math.hypot(dx, dz);
					if (d > 40) continue;
					const f = fwd(q.ry);
					const c = (f.x * dx + f.z * dz) / (d || 1);
					if (c > 0.62 && (d < 8 || (q.torch && d < 26)) && lineOfSight(L.solids, q.x, q.z, e.x, e.z)) {
						seen = true;
						break;
					}
				}
				if (seen || e.cd > 0) continue;
				const p = nearest(e, 20);
				if (!p) continue;
				if (dist2(e, p) < 1.0) {
					this.attack(e, p, 25);
					e.cd = Math.max(e.cd, 5);
					continue;
				}
				const fld = this.fields.get(p.id);
				moveAlong(e, fld && descend(L.grid, fld, e.x, e.z), 2.8 * mult);
			}
		}
		// keep enemies from stacking up
		for (let i = 0; i < this.enemies.length; i++)
			for (let j = i + 1; j < this.enemies.length; j++) {
				const a = this.enemies[i],
					b = this.enemies[j];
				const dx = b.x - a.x,
					dz = b.z - a.z,
					d2 = dx * dx + dz * dz;
				if (d2 < 0.5 && d2 > 1e-6) {
					const d = Math.sqrt(d2),
						push = (0.71 - d) * 0.5;
					a.x -= (dx / d) * push;
					a.z -= (dz / d) * push;
					b.x += (dx / d) * push;
					b.z += (dz / d) * push;
				}
			}
	}

	attack(e, p, dmg) {
		if (e.cd > 0 || p.invuln > 0) return;
		e.cd = 1.3;
		p.hp -= dmg;
		p.hurtT = 0;
		p.invuln = 1; // brief stagger window so a crowd can't chain hits
		this.event({ k: 'hit', pid: p.id, by: e.type, id: e.id });
		this.stats.hitsBy[e.type] = (this.stats.hitsBy[e.type] || 0) + 1;
		if (p.hp <= 0) {
			p.hp = 0;
			p.downed = true;
			p.hold = null;
			this.stats.downs++;
			this.dropAll(p);
			this.event({ k: 'downed', pid: p.id, name: p.name });
			// everything nearby loses interest for a while, giving teammates a window to revive
			for (const o of this.enemies)
				if (dist2(o, p) < 36) {
					o.cd = Math.max(o.cd, 6);
					if (o.type === 'zombie') o.state = 'wander';
				}
		}
	}

	snapshot() {
		const s = {
			t: 's',
			ph: this.phase,
			pt: +this.phaseT.toFixed(2),
			op: OPENING_TIME,
			fin: FINALE_TIME,
			list: this.list,
			sc: this.scans,
			iv: this.itemsV,
			cases: this.cases.map((c) => c.open),
			res: this.result,
			P: [...this.players.values()].map((p) => ({
				id: p.id,
				n: p.name,
				sl: p.slot,
				x: +p.x.toFixed(2),
				y: +p.y.toFixed(2),
				z: +p.z.toFixed(2),
				ry: +p.ry.toFixed(3),
				pi: +p.pitch.toFixed(2),
				tr: p.torch ? 1 : 0,
				b: Math.round(p.battery),
				hp: Math.round(p.hp),
				dn: p.downed ? 1 : 0,
				es: p.escaped ? 1 : 0,
				c: p.carrying,
				h: p.hold ? p.hold.kind : null,
				hp2: +p.holdP.toFixed(2),
				rd: p.ready ? 1 : 0,
				an: p.anim,
				bot: p.bot ? 1 : 0
			})),
			E: this.enemies.map((e) => ({
				id: e.id,
				ty: e.type,
				x: +e.x.toFixed(2),
				z: +e.z.toFixed(2),
				ry: +e.ry.toFixed(2),
				st: e.state,
				v: e.v,
				mv: +e.mv.toFixed(1)
			}))
		};
		return s;
	}

	send() {
		const s = this.snapshot();
		const withItems = { ...s, items: this.items, graves: this.graves };
		for (const p of this.players.values()) {
			if (p.ws.readyState !== 1) continue;
			const full = p.sentV !== this.itemsV;
			p.sentV = this.itemsV;
			p.ws.send(JSON.stringify(full ? withItems : s));
		}
	}
}

export { L as LAYOUT, SHUTTER };
