import * as THREE from 'three';
import { character, CHARACTERS, propInstance, pillsModel, ringModel, batteryModel, canvasTexture } from './assets.js';
import { ITEMS } from '../shared/items.js';

const PLAYER_COLORS = ['#ffcf4a', '#58d1ff', '#ff6fa8', '#8dff6a'];

function nameTag(text, color) {
	const tex = canvasTexture(256, 64, (ctx) => {
		ctx.font = 'bold 34px Arial';
		ctx.textAlign = 'center';
		ctx.lineWidth = 6;
		ctx.strokeStyle = 'rgba(0,0,0,0.8)';
		ctx.strokeText(text, 128, 44);
		ctx.fillStyle = color;
		ctx.fillText(text, 128, 44);
	});
	const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, fog: false }));
	sp.scale.set(1.2, 0.3, 1);
	sp.position.y = 2.05;
	sp.renderOrder = 10;
	return sp;
}

const ghostMat = (color) =>
	new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, transparent: true, opacity: 0.55, roughness: 0.3, depthWrite: false });
const mannequinMat = new THREE.MeshPhysicalMaterial({ color: 0xece8e2, roughness: 0.28, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.2 });
const shopperTint = (m) => {
	const c = m.clone();
	c.color = new THREE.Color(0.75, 0.78, 0.8);
	return c;
};

function overrideMaterials(obj, fn) {
	obj.traverse((o) => {
		if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(fn) : fn(o.material);
	});
}

let sparkleTex;
function sparkle() {
	sparkleTex ??= canvasTexture(64, 64, (ctx) => {
		const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
		g.addColorStop(0, 'rgba(255,250,220,1)');
		g.addColorStop(0.2, 'rgba(255,230,150,0.6)');
		g.addColorStop(1, 'rgba(255,200,100,0)');
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, 64, 64);
		ctx.fillStyle = 'rgba(255,255,240,0.9)';
		ctx.fillRect(31, 4, 2, 56);
		ctx.fillRect(4, 31, 56, 2);
	});
	const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkleTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
	sp.scale.setScalar(0.5);
	return sp;
}

export class Actors {
	constructor(world) {
		this.world = world;
		this.scene = world.scene;
		this.players = new Map();
		this.enemies = new Map();
		this.items = new Map();
		this.dynamicSources = [];
		this.localId = null;
		this.handGroup = new THREE.Group(); // first-person held items
		this.handGroup.position.set(0.32, -0.34, -0.55);
		world.camera.add(this.handGroup);
	}

	// ----- players -----
	async ensurePlayer(p) {
		if (this.players.has(p.id)) return this.players.get(p.id);
		const e = { id: p.id, root: new THREE.Group(), pos: new THREE.Vector3(p.x, 0, p.z), ry: p.ry, char: null, slot: p.sl };
		this.players.set(p.id, e);
		this.scene.add(e.root);
		const ch = await character(CHARACTERS.players[p.sl % 4], 1.72);
		e.char = ch;
		e.root.add(ch.root);
		ch.model.rotation.y = Math.PI;
		e.tag = nameTag(p.n, PLAYER_COLORS[p.sl % 4]);
		e.root.add(e.tag);
		ch.play('idle');
		return e;
	}

	// ----- enemies -----
	async ensureEnemy(en) {
		let e = this.enemies.get(en.id);
		if (!e) {
			e = { id: en.id, root: new THREE.Group(), pos: new THREE.Vector3(en.x, 0, en.z), ry: en.ry, forms: {}, form: null };
			this.enemies.set(en.id, e);
			this.scene.add(e.root);
		}
		const form = this.formFor(en);
		if (e.form !== form && !e.loading) {
			e.loading = true;
			if (!e.forms[form]) e.forms[form] = await this.makeForm(form, en);
			e.loading = false;
			for (const f of Object.values(e.forms)) f.root.visible = false;
			e.forms[form].root.visible = true;
			e.form = form;
		}
		return e;
	}

	formFor(en) {
		if (en.ty === 'zombie') return 'zombie';
		if (en.ty === 'mannequin') return 'mannequin';
		if (en.ty === 'security') return 'security';
		if (en.v >= 100) return en.v === 101 ? 'bride' : 'spirit';
		return en.st === 'shopper' || en.st === 'lurk' ? 'shopper' : 'ghost';
	}

	async makeForm(form, en) {
		let ch;
		if (form === 'zombie') {
			ch = await character(en.v % 3 === 0 ? CHARACTERS.skeleton : CHARACTERS.zombie, 1.8);
			ch.play('walk', 0, 0.7);
		} else if (form === 'mannequin') {
			ch = await character(CHARACTERS.shoppers[en.v % CHARACTERS.shoppers.length], 1.8);
			overrideMaterials(ch.model, () => mannequinMat);
			const poses = ['emote-yes', 'interact-right', 'holding-both', 'idle', 'attack-melee-left'];
			const a = ch.actions[poses[en.v % poses.length]] || ch.actions.idle;
			a.play();
			ch.mixer.update(0.37 + (en.v % 5) * 0.21);
			a.paused = true;
		} else if (form === 'security') {
			ch = await character('mini-market/character-employee', 1.85);
			overrideMaterials(ch.model, (m) => {
				const c = m.clone();
				c.color = new THREE.Color(0.35, 0.38, 0.55);
				c.emissive = new THREE.Color(0.25, 0, 0);
				return c;
			});
			ch.play('walk');
		} else if (form === 'shopper') {
			ch = await character(CHARACTERS.shoppers[en.v % CHARACTERS.shoppers.length], 1.68);
			overrideMaterials(ch.model, shopperTint);
			ch.play('walk', 0, 0.55);
		} else {
			const colors = { ghost: 0x9fd0ff, bride: 0xfff0f6, spirit: 0x9dffc8 };
			ch = await character(form === 'bride' ? CHARACTERS.vampire : CHARACTERS.ghost, form === 'bride' ? 1.95 : 1.8);
			overrideMaterials(ch.model, () => ghostMat(colors[form]));
			ch.play('walk');
			ch.ghost = true;
		}
		ch.model.rotation.y = Math.PI;
		return ch;
	}

	// ----- items -----
	async ensureItem(it) {
		let e = this.items.get(it.id);
		if (e) return e;
		e = { id: it.id, root: new THREE.Group(), type: it.type };
		this.items.set(it.id, e);
		this.scene.add(e.root);
		let obj;
		const def = ITEMS[it.type];
		if (it.type === 'battery') obj = batteryModel();
		else if (def.model === 'pills') obj = pillsModel();
		else if (def.model === 'ring') obj = ringModel();
		else obj = await propInstance(def.model, def.size);
		e.obj = obj;
		e.root.add(obj);
		if (it.type !== 'battery') {
			e.spark = sparkle();
			e.spark.position.y = def.size * 0.9 + 0.15;
			e.root.add(e.spark);
		}
		return e;
	}

	sync(snap, localId, now) {
		this.localId = localId;
		const seen = new Set();
		for (const p of snap.P) {
			seen.add(p.id);
			if (p.id === localId) continue;
			this.ensurePlayer(p).then((e) => {
				e.target = p;
			});
		}
		for (const [id, e] of this.players)
			if (!seen.has(id)) {
				this.scene.remove(e.root);
				this.players.delete(id);
			}
		const seenE = new Set();
		for (const en of snap.E) {
			seenE.add(en.id);
			this.ensureEnemy(en).then((e) => (e.target = en));
		}
		for (const [id, e] of this.enemies)
			if (!seenE.has(id)) {
				this.scene.remove(e.root);
				this.enemies.delete(id);
			}
		if (snap.items) {
			this.itemState = snap.items;
			const ids = new Set(snap.items.map((i) => i.id));
			for (const it of snap.items) this.ensureItem(it);
			for (const [id, e] of this.items)
				if (!ids.has(id)) {
					e.root.removeFromParent();
					this.items.delete(id);
				}
		}
		this.snap = snap;
	}

	update(dt, camPos, phase) {
		const snap = this.snap;
		if (!snap) return;
		const dark = phase !== 'lobby' && phase !== 'opening';
		this.dynamicSources.length = 0;
		let torchI = 0;
		const byId = new Map(snap.P.map((p) => [p.id, p]));

		for (const e of this.players.values()) {
			const p = e.target;
			if (!p || !e.char) continue;
			const k = Math.min(1, dt * 12);
			e.pos.x += (p.x - e.pos.x) * k;
			e.pos.z += (p.z - e.pos.z) * k;
			let d = p.ry - e.ry;
			d = Math.atan2(Math.sin(d), Math.cos(d));
			e.ry += d * k;
			e.root.position.set(e.pos.x, p.y || 0, e.pos.z);
			e.root.rotation.y = e.ry;
			e.root.visible = !p.es;
			const anim = p.dn ? 'die' : p.an === 'sprint' ? 'sprint' : p.an === 'walk' ? 'walk' : p.c.length ? 'holding-both' : 'idle';
			e.char.play(anim);
			e.char.mixer.update(dt);
			if (p.tr && !p.dn && !p.es) {
				const sp = this.world.remoteTorch(torchI++);
				const fx = -Math.sin(e.ry),
					fz = -Math.cos(e.ry);
				sp.position.set(e.pos.x + fx * 0.3, 1.4, e.pos.z + fz * 0.3);
				sp.target.position.set(e.pos.x + fx * 6, 1.4 + Math.sin(p.pi) * 6 - 0.8, e.pos.z + fz * 6);
				sp.intensity = 12;
				sp.color.set(0xfff0d8);
				sp.visible = true;
				sp.beam.visible = dark;
				sp.beam.position.copy(sp.position);
				sp.beam.lookAt(sp.position.clone().multiplyScalar(2).sub(sp.target.position));
				sp.beam.material.uniforms.strength.value = 0.05;
			}
		}
		for (let i = torchI; i < this.world.remoteTorches.length; i++) {
			this.world.remoteTorches[i].intensity = 0;
			this.world.remoteTorches[i].beam.visible = false;
		}

		for (const e of this.enemies.values()) {
			const en = e.target;
			if (!en || !e.form) continue;
			const ch = e.forms[e.form];
			const k = Math.min(1, dt * 10);
			e.pos.x += (en.x - e.pos.x) * k;
			e.pos.z += (en.z - e.pos.z) * k;
			let d = en.ry - e.ry;
			d = Math.atan2(Math.sin(d), Math.cos(d));
			e.ry += d * k;
			e.root.position.set(e.pos.x, 0, e.pos.z);
			e.root.rotation.y = e.ry;
			const banished = en.st === 'banished';
			e.fade = (e.fade ?? 1) + ((banished ? 0 : 1) - (e.fade ?? 1)) * Math.min(1, dt * 3);
			e.root.visible = e.fade > 0.03;
			if (e.form === 'mannequin') continue;
			if (e.form === 'security' && dark) {
				// the guard's torch uses the shared remote-torch pool
				const sp = this.world.remoteTorch(torchI++);
				const fx = -Math.sin(e.ry),
					fz = -Math.cos(e.ry);
				sp.position.set(e.pos.x + fx * 0.3, 1.5, e.pos.z + fz * 0.3);
				sp.target.position.set(e.pos.x + fx * 8, 0.3, e.pos.z + fz * 8);
				sp.color.set(en.st === 'chase' ? 0xff6050 : 0xdfe8ff);
				sp.intensity = 14;
				sp.visible = true;
				sp.beam.visible = true;
				sp.beam.position.copy(sp.position);
				sp.beam.lookAt(sp.position.clone().multiplyScalar(2).sub(sp.target.position));
				sp.beam.material.uniforms.strength.value = 0.06;
			}
			if (ch.ghost) {
				ch.root.position.y = 0.25 + Math.sin(performance.now() / 400 + e.pos.x) * 0.12;
				ch.model.traverse((o) => o.isMesh && (o.material.opacity = 0.55 * e.fade * (0.8 + 0.2 * Math.sin(performance.now() / 90))));
				if (e.root.visible && dark)
					this.dynamicSources.push({ kind: 'ghost', level: e.fade, pos: new THREE.Vector3(e.pos.x, 1.3, e.pos.z), def: { color: e.form === 'spirit' ? 0x9dffc8 : 0x9fc8ff, intensity: 5, distance: 7 } });
			}
			if (en.mv > 0.05) ch.play(en.mv > 2.2 ? 'sprint' : 'walk', 0.2, e.form === 'zombie' ? 0.75 : 1);
			else if (e.attackT > 0) ch.play('attack-melee-right');
			else ch.play('idle');
			e.attackT = (e.attackT || 0) - dt;
			ch.mixer.update(dt);
		}

		const local = byId.get(this.localId);
		const held = [];
		for (const it of this.itemState || []) {
			const e = this.items.get(it.id);
			if (!e || !e.obj) continue;
			const shown = it.st === 'shelf' || it.st === 'dropped' || it.st === 'caged' || it.st === 'carried';
			e.root.visible = shown;
			if (!shown) continue;
			if (e.spark) {
				const dd = e.root.position.distanceTo(camPos);
				e.spark.visible = it.st !== 'carried' && dd < 14;
				e.spark.material.opacity = 0.5 + 0.5 * Math.sin(performance.now() / 250 + e.root.position.x);
			}
			if (it.st === 'carried') {
				if (it.holder === this.localId) {
					held.push(e);
					continue;
				}
				const h = this.players.get(it.holder);
				if (h) {
					if (e.root.parent !== this.scene) this.scene.add(e.root);
					const fx = -Math.sin(h.ry),
						fz = -Math.cos(h.ry);
					const slot = (h.target?.c || []).indexOf(it.id);
					e.root.position.set(h.pos.x + fx * 0.45 + fz * (slot ? 0.25 : -0.1), 1.0, h.pos.z + fz * 0.45 - fx * (slot ? 0.25 : -0.1));
					e.root.rotation.y = h.ry;
				}
			} else {
				if (e.root.parent !== this.scene) {
					this.scene.add(e.root);
					e.root.scale.setScalar(1);
				}
				e.root.position.set(it.x, it.y, it.z);
			}
			if (it.type === 'candle' && it.st === 'carried' && dark)
				this.dynamicSources.push({ kind: 'candle', level: 0.85 + Math.random() * 0.15, pos: e.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.4, 0)), def: { color: 0xffa040, intensity: 4, distance: 8 } });
		}
		// first person: held items float at the bottom of the view
		held.forEach((e, i) => {
			if (e.root.parent !== this.handGroup) {
				this.handGroup.add(e.root);
				e.root.scale.setScalar(0.7);
				e.root.rotation.set(0, 0.6, 0);
			}
			e.root.position.set(i ? -0.62 : 0, -0.05 + Math.sin(performance.now() / 300) * 0.01, 0);
		});
		for (const e of this.items.values()) if (e.root.parent === this.handGroup && !held.includes(e)) this.scene.add(e.root);
		if (local && local.dn) this.handGroup.visible = false;
		else this.handGroup.visible = true;
	}

	enemyAttack(id) {
		const e = this.enemies.get(id);
		if (e) e.attackT = 0.6;
	}
}

export { PLAYER_COLORS };
