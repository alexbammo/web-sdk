import * as THREE from 'three';
import { World, layout } from './world.js';
import { Actors, PLAYER_COLORS } from './actors.js';
import { Audio } from './audio.js';
import { Bot } from './bot.js';
import { collide, MAIN_TILL, SHUTTER, EXIT_ZONE } from '../shared/layout.js';
import { ITEMS } from '../shared/items.js';

const params = new URLSearchParams(location.search);
const IS_BOT = params.has('bot');
const QUALITY = params.get('q') || (IS_BOT ? 'low' : 'high');
const $ = (id) => document.getElementById(id);

const game = {
	id: null,
	ws: null,
	snap: null,
	items: [],
	phase: 'lobby',
	me: { x: 48, z: 5, y: 0, yaw: Math.PI, pitch: 0, stamina: 1, torch: false, downed: false },
	input: { fwd: 0, right: 0, sprint: false, interact: false, drop: false, torchToggle: false },
	layout,
	hold: null,
	target: null,
	events: [],
	log: [],
	stats: { frames: 0 }
};
window.game = game; // handy for debugging and automated tests
game.render = () => world.render();

const world = new World($('c'), QUALITY);
const audio = new Audio();
let actors;
let bot = null;

function resize() {
	world.resize(innerWidth, innerHeight);
}
addEventListener('resize', resize);

// ---------------- networking ----------------
function send(m) {
	if (game.ws?.readyState === 1) game.ws.send(JSON.stringify(m));
}
game.send = send;

function connect(room, name) {
	const proto = location.protocol === 'https:' ? 'wss' : 'ws';
	const ws = new WebSocket(`${proto}://${location.host}/ws?room=${encodeURIComponent(room)}`);
	game.ws = ws;
	game.room = room;
	ws.onopen = () => send({ t: 'hello', name, bot: IS_BOT });
	ws.onmessage = (ev) => {
		const m = JSON.parse(ev.data);
		if (m.t === 'welcome') {
			game.id = m.id;
			game.room = m.room;
			const url = new URL(location.href);
			url.search = `?room=${m.room}`;
			$('share').value = url.href;
			$('roomcode').textContent = m.room;
		} else if (m.t === 's') onSnapshot(m);
		else if (m.t === 'ev') onEvent(m);
		else if (m.t === 'full') toast('That room is full (4 players max).');
	};
	ws.onclose = () => toast('Disconnected from server');
}

let lastIv = -1;
function onSnapshot(s) {
	const prevPhase = game.phase;
	game.snap = s;
	game.phase = s.ph;
	if (s.items) {
		game.items = s.items;
		lastIv = s.iv;
		if (s.graves) world.setGraves(s.graves);
	}
	const mine = s.P.find((p) => p.id === game.id);
	if (mine) {
		const me = game.me;
		// server resets (new run) teleport us back to the entrance
		if ((prevPhase === 'lobby' || prevPhase === 'ended') && s.ph === 'opening') {
			me.x = mine.x;
			me.z = mine.z;
			me.yaw = Math.PI;
			me.torch = false;
		}
		if (mine.dn && !me.downed) me.downed = true;
		if (!mine.dn && me.downed) me.downed = false;
		me.hp = mine.hp;
		me.battery = mine.b;
		me.carrying = mine.c;
		me.escaped = !!mine.es;
		me.holdP = mine.hp2;
		if (mine.b <= 0) me.torch = false;
	}
	if (prevPhase !== s.ph) onPhase(s.ph, prevPhase);
	actors?.sync(s, game.id);
}

function onPhase(ph) {
	world.setPhase(ph);
	$('lobby').classList.toggle('hidden', ph !== 'lobby');
	$('end').classList.toggle('hidden', ph !== 'ended');
	if (ph === 'lobby') {
		$('ready').classList.remove('on');
		$('ready').textContent = 'Ready';
		if (IS_BOT) send({ t: 'ready', v: true });
	}
	if (ph === 'opening') {
		game.me.torch = false;
		audio.sfx('shutter');
	}
	if (ph === 'lockdown') game.me.torch = true;
	if (ph === 'finale') world.setSign('exitSign', 'EXIT', '#3dff7a', '#062010');
}

function onEvent(e) {
	game.log.push({ t: performance.now(), ...e });
	if (game.log.length > 200) game.log.shift();
	const me = game.me;
	const dist = e.x !== undefined ? Math.hypot(e.x - me.x, e.z - me.z) : 0;
	switch (e.k) {
		case 'announce':
			if (e.voice) subtitle(`TANNOY: "${e.text}"`, 7000), audio.say(e.text);
			else toast(e.text);
			break;
		case 'blackout':
			world.blackout();
			audio.sfx('blackout');
			setTimeout(() => audio.sfx('shutter'), 800);
			world.setSign('exitSign', 'COMPLETE PURCHASE', '#ff3b30', '#200606');
			world.setSign('storeName', 'ST MERCY CEMETERY', '#ff3b30', '#140404');
			subtitle(`TANNOY: "${e.text}"`, 8000);
			audio.say(e.text, true);
			break;
		case 'scan':
			audio.sfx('beep', dist);
			world.haunt = game.snap?.sc || 0;
			world.scanFlash = world.time + 3;
			subtitle(`SELF-CHECKOUT: "${e.text}"`, 5000);
			audio.say(e.text, true);
			setTillScreen(e.left ? `${ITEMS[e.item].label.toUpperCase()}  ✓\n${e.left} ITEM${e.left > 1 ? 'S' : ''} REMAINING` : 'PAYMENT ACCEPTED');
			break;
		case 'receipt':
			audio.sfx('receipt');
			subtitle(`TANNOY: "${e.text}"`, 8000);
			audio.say(e.text, true);
			setTillScreen('TAKE YOUR RECEIPT\nRUN');
			break;
		case 'pickup':
			if (e.pid === game.id) audio.sfx('pickup');
			break;
		case 'battery':
			if (e.pid === game.id) (audio.sfx('pickup'), toast('Torch battery +60%'));
			break;
		case 'noise':
			if (e.kind === 'teddy' || e.kind === 'doll') audio.sfx('squeak', dist);
			if (e.kind === 'glass') audio.sfx('glass', dist);
			break;
		case 'ghostturn':
			audio.sfx('stinger', dist);
			game.fear = 1;
			break;
		case 'spotted':
			audio.sfx('stinger', dist);
			if (e.pid === game.id) toast('SECURITY: "Oi! Stay where you are!"');
			break;
		case 'banish':
			audio.sfx('banish', dist);
			break;
		case 'hit':
			actors?.enemyAttack(e.id);
			if (e.pid === game.id) {
				audio.sfx('hit');
				game.hurt = 1;
			}
			break;
		case 'downed':
			toast(`${e.name} is down! Hold E beside them to revive.`);
			break;
		case 'revived':
			toast(`${nameOf(e.pid)} was revived by ${nameOf(e.by)}`);
			break;
		case 'guardian':
			toast(e.text);
			audio.sfx('stinger');
			break;
		case 'case':
			audio.sfx('glass');
			break;
		case 'toast':
			if (e.pid === game.id) toast(e.text);
			break;
		case 'escaped':
			toast(`${nameOf(e.pid)} escaped!`);
			break;
		case 'won':
		case 'lost':
			showEnd(e.k === 'won', e.result);
			break;
	}
}

function setTillScreen(text) {
	const t = world.tillScreenTex;
	const c = t.image;
	const ctx = c.getContext('2d');
	ctx.fillStyle = '#e8f4ff';
	ctx.fillRect(0, 0, c.width, c.height);
	ctx.fillStyle = '#123';
	ctx.font = 'bold 40px Arial';
	ctx.textAlign = 'center';
	text.split('\n').forEach((l, i) => ctx.fillText(l, c.width / 2, 100 + i * 60));
	t.needsUpdate = true;
}

const nameOf = (id) => game.snap?.P.find((p) => p.id === id)?.n || 'Someone';

// ---------------- UI ----------------
function toast(text) {
	const d = document.createElement('div');
	d.textContent = text;
	$('toasts').appendChild(d);
	setTimeout(() => d.remove(), 5000);
}
let subT;
function subtitle(text, ms) {
	$('subs').textContent = text;
	clearTimeout(subT);
	subT = setTimeout(() => ($('subs').textContent = ''), ms);
}

function showEnd(won, r) {
	$('endtitle').innerHTML = won ? 'YOU ESCAPED<span>.</span>' : 'CLOSED<span>FOREVER</span>';
	const list = (game.snap?.list || []).map((k) => `  ${ITEMS[k].label.padEnd(22)} £${(Math.random() * 9 + 1).toFixed(2)}`).join('\n');
	$('receipt').textContent = [
		'   ST MERCY SUPERSTORE',
		'   ---------------------------',
		list,
		'   ---------------------------',
		`   ITEMS SCANNED   ${r.scanned}/${game.snap?.list.length || 5}`,
		`   TIME IN STORE   ${Math.floor(r.time / 60)}m ${r.time % 60}s`,
		`   KNOCK-DOWNS     ${r.downs}   REVIVES ${r.revives}`,
		'',
		`   ESCAPED: ${r.escaped.join(', ') || 'nobody'}`,
		r.left.length ? `   LEFT BEHIND: ${r.left.join(', ')}` : '   NOBODY LEFT BEHIND',
		'',
		won ? '   THANK YOU FOR SHOPPING' : '   YOU WILL SHOP HERE FOREVER'
	].join('\n');
	$('end').classList.remove('hidden');
	document.exitPointerLock?.();
}

function updateLobby() {
	const s = game.snap;
	if (!s) return;
	$('lobbylist').innerHTML = s.P.map(
		(p) => `<li style="border-color:${PLAYER_COLORS[p.sl % 4]}"><span>${esc(p.n)}${p.id === game.id ? ' (you)' : ''}${p.bot ? ' 🤖' : ''}</span><b>${p.rd ? 'READY' : '…'}</b></li>`
	).join('');
}
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function updateHud() {
	const s = game.snap;
	if (!s) return;
	const me = game.me;
	const ph = s.ph;
	const phaseEl = $('phase');
	phaseEl.className = '';
	if (ph === 'opening') phaseEl.textContent = `STORE CLOSING IN ${Math.max(0, Math.ceil(s.op - s.pt))}s`;
	else if (ph === 'lockdown') {
		phaseEl.textContent = `LOCKDOWN · ${s.sc}/${s.list.length} SCANNED`;
		phaseEl.className = 'red';
	} else if (ph === 'finale') {
		phaseEl.textContent = `EXIT OPEN · ${Math.max(0, Math.ceil(s.fin - s.pt))}s · GET OUT`;
		phaseEl.className = 'green';
	} else phaseEl.textContent = ph.toUpperCase();

	if (ph === 'opening') $('list').innerHTML = `<h3>SHOPPING LIST</h3><div class="it"><small>Your list will appear at closing time.<br>Explore the store while the lights are on.</small></div>`;
	else if (s.list.length) {
		$('list').innerHTML =
			`<h3>SHOPPING LIST</h3>` +
			s.list
				.map((k) => {
					const it = game.items.find((i) => i.type === k);
					const st = it?.st;
					const holder = it?.holder ? s.P.find((p) => p.id === it.holder) : null;
					const cls = st === 'scanned' ? 'done' : holder ? 'held' : '';
					const extra = st === 'scanned' ? 'scanned ✓' : holder ? `carried by ${esc(holder.n)}` : st === 'dropped' ? 'dropped on the floor!' : ITEMS[k].hint;
					return `<div class="it ${cls}">☐ ${ITEMS[k].label}<small>${extra}</small></div>`;
				})
				.join('') +
			(ph === 'lockdown' ? `<div class="it"><small>Scan everything at the SELF CHECKOUT by the exit.</small></div>` : '');
	}
	$('list').classList.toggle('hidden', ph === 'lobby' || !!game.hideList);

	$('team').innerHTML = s.P.filter((p) => p.id !== game.id)
		.map(
			(p) =>
				`<div class="tm ${p.dn ? 'down' : ''}" style="border-color:${PLAYER_COLORS[p.sl % 4]}">${esc(p.n)}${p.dn ? ' - DOWN' : p.es ? ' - ESCAPED' : ''}<i style="width:${p.hp}%"></i></div>`
		)
		.join('');
	$('hpbar').style.width = `${me.hp ?? 100}%`;
	$('batbar').style.width = `${me.battery ?? 100}%`;
	$('stbar').style.width = `${me.stamina * 100}%`;
	$('carry').textContent = me.carrying?.length ? 'Carrying: ' + me.carrying.map((id) => ITEMS[game.items.find((i) => i.id === id)?.type]?.label).join(', ') : '';
	$('downed').classList.toggle('hidden', !me.downed || ph === 'ended');
	const t = game.target;
	$('prompt').textContent = me.downed ? '' : t ? t.label : '';
	const hp = $('hold');
	hp.style.display = game.hold && me.holdP > 0 ? 'block' : 'none';
	hp.firstChild.style.width = `${(me.holdP || 0) * 100}%`;
	if (ph === 'lobby') updateLobby();
}

// ---------------- input ----------------
const keys = new Set();
addEventListener('keydown', (e) => {
	if (document.activeElement?.tagName === 'INPUT') return;
	keys.add(e.code);
	if (e.code === 'KeyF') game.input.torchToggle = true;
	if (e.code === 'KeyQ') game.input.drop = true;
	if (e.code === 'Tab') {
		e.preventDefault();
		game.hideList = !game.hideList;
	}
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('mousemove', (e) => {
	if (document.pointerLockElement !== $('c')) return;
	game.me.yaw -= e.movementX * 0.0022;
	game.me.pitch = Math.max(-1.3, Math.min(1.3, game.me.pitch - e.movementY * 0.0022));
});
$('c').addEventListener('click', () => {
	if (game.id && game.phase !== 'lobby') $('c').requestPointerLock?.();
});
document.addEventListener('pointerlockchange', () => $('clickhint').classList.toggle('hidden', !!document.pointerLockElement || game.phase === 'lobby' || IS_BOT));
addEventListener('mousedown', (e) => e.button === 0 && document.pointerLockElement && keys.add('Mouse0'));
addEventListener('mouseup', (e) => e.button === 0 && keys.delete('Mouse0'));

function humanInput() {
	const i = game.input;
	i.fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
	i.right = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
	i.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
	i.interact = keys.has('KeyE') || keys.has('Mouse0');
}

// ---------------- interaction targets ----------------
function findTarget() {
	const me = game.me;
	const s = game.snap;
	if (!s || me.downed || me.escaped) return null;
	const fx = -Math.sin(me.yaw),
		fz = -Math.cos(me.yaw);
	// 1. revive a downed teammate
	for (const p of s.P) if (p.id !== game.id && p.dn && Math.hypot(p.x - me.x, p.z - me.z) < 2.3) return { kind: 'revive', target: p.id, label: `Hold E - revive ${p.n}` };
	// 2. scan at the self checkout
	if (Math.hypot(MAIN_TILL.x - me.x, MAIN_TILL.z - me.z) < MAIN_TILL.r + 0.3) {
		const listed = (me.carrying || []).some((id) => s.list.includes(game.items.find((i) => i.id === id)?.type));
		if (listed) return { kind: 'scan', label: s.ph === 'opening' ? 'The till is not ready yet…' : 'Hold E - scan items' };
	}
	// 3. items (pick up) and display cases
	let best = null,
		bestScore = -1e9;
	for (const it of game.items) {
		if (it.st !== 'shelf' && it.st !== 'dropped' && it.st !== 'caged') continue;
		const dx = it.x - me.x,
			dz = it.z - me.z;
		const d = Math.hypot(dx, dz);
		if (d > (it.reach || 2.2)) continue;
		const facing = (dx * fx + dz * fz) / (d || 1);
		if (facing < 0.35 && d > 0.9) continue;
		const score = facing * 2 - d;
		if (score > bestScore) (bestScore = score), (best = it);
	}
	if (best) {
		if (best.st === 'caged') return { kind: 'case', target: best.caseAt, label: 'Hold E - force the display case (noisy!)' };
		const label = best.type === 'battery' ? 'Torch battery' : ITEMS[best.type].label;
		return { kind: 'pickup', target: best.id, label: `E - take ${label}` };
	}
	return null;
}

// ---------------- local simulation ----------------
let sendT = 0;
let lastInteract = false;
function step(dt) {
	const me = game.me;
	const i = game.input;
	const ph = game.phase;
	if (bot) bot.update(dt);
	else humanInput();
	if (i.torchToggle) {
		i.torchToggle = false;
		if ((me.battery ?? 100) > 0) me.torch = !me.torch;
	}
	if (i.drop) {
		i.drop = false;
		send({ t: 'drop' });
	}
	const active = ph !== 'lobby' && ph !== 'ended' && !me.escaped;
	let moving = false;
	if (active && !me.downed) {
		let speed = 3.6;
		const sprinting = i.sprint && me.stamina > 0.05 && i.fwd > 0;
		if (sprinting) speed = 6.2;
		// bulky items need a teammate beside you
		const bulky = (me.carrying || []).some((id) => ITEMS[game.items.find((it) => it.id === id)?.type]?.quirk === 'bulky');
		if (bulky) {
			const helper = game.snap?.P.some((p) => p.id !== game.id && !p.dn && Math.hypot(p.x - me.x, p.z - me.z) < 3.2);
			speed = helper ? 3.3 : 1.25;
			game.bulkyHelp = helper;
		}
		const len = Math.hypot(i.fwd, i.right);
		if (len > 0.01) {
			const f = i.fwd / len,
				r = i.right / len;
			const sx = -Math.sin(me.yaw),
				sz = -Math.cos(me.yaw);
			const rx = Math.cos(me.yaw),
				rz = -Math.sin(me.yaw);
			let nx = me.x + (sx * f + rx * r) * speed * dt;
			let nz = me.z + (sz * f + rz * r) * speed * dt;
			const extra = ph === 'finale' ? [] : [SHUTTER];
			const c = collide(layout.solids, nx, nz, 0.35, extra);
			me.x = c.x;
			me.z = c.z;
			if (ph === 'finale') me.z = Math.max(me.z, EXIT_ZONE.z0);
			moving = true;
		}
		me.stamina = sprinting && moving ? Math.max(0, me.stamina - dt / 5) : Math.min(1, me.stamina + dt / 7);
		me.sprinting = sprinting && moving;
	}
	me.moving = moving;

	// interaction
	game.target = active ? findTarget() : null;
	const t = game.target;
	if (i.interact && t) {
		if (t.kind === 'pickup') {
			if (!lastInteract) send({ t: 'pickup', id: t.target });
		} else {
			const key = `${t.kind}:${t.target}`;
			if (game.hold !== key) {
				game.hold = key;
				send({ t: 'hold', v: true, kind: t.kind, target: t.target });
			}
		}
	} else if (game.hold) {
		game.hold = null;
		send({ t: 'hold', v: false });
	}
	if (game.hold && t && `${t.kind}:${t.target}` !== game.hold) {
		game.hold = null;
		send({ t: 'hold', v: false });
	}
	lastInteract = i.interact;

	sendT -= dt;
	if (sendT <= 0 && game.id) {
		sendT = 1 / 15;
		send({ t: 'st', x: +me.x.toFixed(3), y: 0, z: +me.z.toFixed(3), ry: +me.yaw.toFixed(3), pitch: +me.pitch.toFixed(2), torch: me.torch, mv: moving, sp: me.sprinting, an: me.sprinting ? 'sprint' : moving ? 'walk' : 'idle' });
	}
}

// ---------------- render loop ----------------
let last = performance.now();
let bob = 0;
let acc = 0;
const renderEvery = +(params.get('renderEvery') || (IS_BOT ? 3 : 1));
let frame = 0;
function loop() {
	requestAnimationFrame(loop);
	const now = performance.now();
	let dt = Math.min(0.5, (now - last) / 1000);
	last = now;
	// fixed-step simulation so slow (headless) clients still move at the right speed
	acc += dt;
	while (acc >= 1 / 60) {
		step(1 / 60);
		acc -= 1 / 60;
	}
	const me = game.me;
	const cam = world.camera;
	bob += dt * (me.moving ? (me.sprinting ? 13 : 9) : 0);
	const eye = me.downed ? 0.35 : 1.62 + Math.sin(bob) * 0.035;
	cam.position.set(me.x, eye, me.z);
	cam.rotation.set(me.pitch, me.yaw, me.downed ? 0.35 : Math.sin(bob / 2) * 0.006, 'YXZ');
	const flick = me.battery < 15 ? (Math.random() < 0.08 ? 0.1 : 1) : 1;
	world.torch.intensity = me.torch && game.phase !== 'lobby' && !me.escaped && !me.downed ? 8 * flick : 0;
	world.localBeam.visible = world.torch.intensity > 0 && game.phase !== 'opening';
	world.localBeam.material.uniforms.strength.value = 0.035 * flick;
	game.hurt = Math.max(0, (game.hurt || 0) - dt * 1.2);
	game.fear = Math.max(0, (game.fear || 0) - dt * 0.5);
	const lowHp = me.hp !== undefined && me.hp < 40 ? 0.5 : 0;
	actors.update(dt, cam.position, game.phase);
	world.update(dt, { dynamicSources: actors.dynamicSources, hurt: Math.max(game.hurt, lowHp, me.downed ? 0.8 : 0), fear: game.fear });
	audio.tick(game.phase, game.snap?.sc || 0);
	if (++frame % renderEvery === 0) world.render();
	game.stats.frames++;
	if (frame % 6 === 0) updateHud();
}

// ---------------- boot ----------------
async function boot() {
	resize();
	await world.build();
	actors = new Actors(world);
	resize();
	// menu camera: slow drift down the main aisle while the lights are on
	world.camera.position.set(48, 1.7, 5);
	requestAnimationFrame(loop);
	game.ready = true;

	const room = params.get('room') || '';
	$('room').value = room;
	$('name').value = params.get('name') || localStorage.getItem('ct-name') || '';
	const join = () => {
		const name = $('name').value.trim() || `Shopper${(Math.random() * 90 + 10) | 0}`;
		try {
			localStorage.setItem('ct-name', name);
		} catch {
			/* ignore */
		}
		audio.start();
		$('menu').classList.add('hidden');
		$('hud').classList.remove('hidden');
		$('lobby').classList.remove('hidden');
		connect($('room').value.trim() || 'MAIN', name);
	};
	$('join').onclick = join;
	$('ready').onclick = () => {
		const on = !$('ready').classList.contains('on');
		$('ready').classList.toggle('on', on);
		$('ready').textContent = on ? 'Ready ✓' : 'Ready';
		send({ t: 'ready', v: on });
	};
	$('start').onclick = () => send({ t: 'start' });
	if (IS_BOT) {
		bot = game.bot = new Bot(game);
		audio.muted = true;
		join();
	}
}
boot();
