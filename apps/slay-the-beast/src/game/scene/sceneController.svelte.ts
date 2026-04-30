import type { BiomeId, BetMode, HeroId, BigEnemyId, BossId, FodderSpriteId } from '../types';
import { FODDER_SUBSET } from '../assets';

// Single-source-of-truth for the gameplay layer. Handlers in bookEventHandlerMap.ts
// mutate this via the imperative API (`scene.spawnFodder`, `scene.chestBanner`, ...).
// Scene.svelte subscribes to `state` and renders.
//
// Coordinate space: portrait 540×960 (mainSizesMap.portrait in stateLayout.ts).
// Origin is top-left of the MainContainer's working area.
//   Hero idles around x=160, y=720 (lower-left third).
//   Enemies enter from x=540 and march toward the hero.

export const STAGE_W = 540;
export const STAGE_H = 960;
export const HERO_X = 160;
export const HERO_Y = 720;
export const ENEMY_LANE_Y = 720;
export const SPAWN_X = 580; // off right edge

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

let nextId = 1;
const newId = () => `a${nextId++}`;

export type ActorKind = 'fodder' | 'big' | 'boss' | 'chest' | 'dragon';

export type Actor = {
	id: string;
	kind: ActorKind;
	textureKey: string; // pixi-svelte loadedAssets key, or 'shape' for graphics-only
	x: number;
	y: number;
	vx: number;
	vy: number;
	scale: number;
	alpha: number;
	deathAt: number | null; // ms timestamp when alpha fade-out begins
	expiresAt: number; // ms timestamp; controller prunes after this
};

export type Floater = {
	id: string;
	text: string;
	color: number;
	x: number;
	y: number;
	vy: number;
	alpha: number;
	expiresAt: number;
};

export type Banner = {
	id: string;
	text: string;
	color: number;
	expiresAt: number;
};

export type Flash = {
	color: number;
	alpha: number;
	startedAt: number;
	durationMs: number;
};

export const sceneState = $state({
	heroId: 'male_warrior' as HeroId,
	biomeId: 'grasslands' as BiomeId,
	mode: 'base' as BetMode,
	heroVisible: false,
	heroDead: false,
	heroScale: 1,
	heroGlow: false, // chaos power glow
	heroShatter: 0, // 0..1 progress; 0 = whole, 1 = fully popped
	skyDim: 0, // 0 = clear, 1 = full storm overlay
	bossActive: null as null | { id: string; bossId: BossId; phase: 'enter' | 'fight' | 'killed' | 'passed' },
	actors: [] as Actor[],
	floaters: [] as Floater[],
	banners: [] as Banner[],
	flash: null as Flash | null,
});

// Tick — called from Scene.svelte's rAF loop. Pure mutation.
export function tickScene(now: number, dt: number) {
	for (const a of sceneState.actors) {
		a.x += a.vx * dt;
		a.y += a.vy * dt;
		if (a.deathAt !== null && now >= a.deathAt) {
			const elapsed = now - a.deathAt;
			a.alpha = Math.max(0, 1 - elapsed / 250);
		}
	}
	sceneState.actors = sceneState.actors.filter((a) => now < a.expiresAt);

	for (const f of sceneState.floaters) {
		f.y += f.vy * dt;
		const remaining = f.expiresAt - now;
		f.alpha = Math.min(1, Math.max(0, remaining / 400));
	}
	sceneState.floaters = sceneState.floaters.filter((f) => now < f.expiresAt);

	sceneState.banners = sceneState.banners.filter((b) => now < b.expiresAt);

	if (sceneState.flash) {
		const elapsed = now - sceneState.flash.startedAt;
		const k = Math.max(0, 1 - elapsed / sceneState.flash.durationMs);
		sceneState.flash.alpha = k * 0.6;
		if (elapsed >= sceneState.flash.durationMs) sceneState.flash = null;
	}
}

// ---- Imperative API used by per-variant render fns ----

export const scene = {
	reset(heroId: HeroId, biomeId: BiomeId, mode: BetMode) {
		sceneState.heroId = heroId;
		sceneState.biomeId = biomeId;
		sceneState.mode = mode;
		sceneState.heroVisible = true;
		sceneState.heroDead = false;
		sceneState.heroScale = 1;
		sceneState.heroGlow = mode === 'chaos';
		sceneState.heroShatter = 0;
		sceneState.skyDim = 0;
		sceneState.bossActive = null;
		sceneState.actors = [];
		sceneState.floaters = [];
		sceneState.banners = [];
		sceneState.flash = null;
	},

	addFloater(text: string, x: number, y: number, color: number, lifeMs = 900) {
		sceneState.floaters.push({
			id: newId(),
			text,
			color,
			x,
			y,
			vy: -0.06,
			alpha: 1,
			expiresAt: performance.now() + lifeMs,
		});
	},

	addBanner(text: string, color: number, lifeMs = 1300) {
		sceneState.banners.push({
			id: newId(),
			text,
			color,
			expiresAt: performance.now() + lifeMs,
		});
	},

	addFlash(color: number, durationMs = 350) {
		sceneState.flash = { color, alpha: 0.6, startedAt: performance.now(), durationMs };
	},

	pickFodderKey(): string {
		const id = FODDER_SUBSET[Math.floor(Math.random() * FODDER_SUBSET.length)];
		return `fodder/${id}`;
	},

	async spawnFodderKill(score: number, walkMs = 700) {
		const id = newId();
		const startX = SPAWN_X;
		const endX = HERO_X + 80;
		const vx = (endX - startX) / walkMs; // px/ms
		sceneState.actors.push({
			id,
			kind: 'fodder',
			textureKey: scene.pickFodderKey(),
			x: startX,
			y: ENEMY_LANE_Y,
			vx,
			vy: 0,
			scale: 0.18,
			alpha: 1,
			deathAt: null,
			expiresAt: performance.now() + walkMs + 350,
		});
		await sleep(walkMs);
		// Kill animation: mark deathAt so tick fades alpha out.
		const actor = sceneState.actors.find((a) => a.id === id);
		if (actor) {
			actor.vx = 0;
			actor.deathAt = performance.now();
		}
		scene.addFloater(`+$${score.toFixed(2)}`, endX, ENEMY_LANE_Y - 60, 0xffd95a, 800);
	},

	async spawnBigEnemyKill(enemyId: BigEnemyId, score: number) {
		const id = newId();
		const startX = SPAWN_X;
		const endX = HERO_X + 140;
		const walkMs = 900;
		const vx = (endX - startX) / walkMs;
		sceneState.actors.push({
			id,
			kind: 'big',
			textureKey: `big/${enemyId}`,
			x: startX,
			y: ENEMY_LANE_Y - 30,
			vx,
			vy: 0,
			scale: 0.42,
			alpha: 1,
			deathAt: null,
			expiresAt: performance.now() + walkMs + 600,
		});
		await sleep(walkMs);
		scene.addFlash(0xffaa44, 280);
		const actor = sceneState.actors.find((a) => a.id === id);
		if (actor) {
			actor.vx = 0;
			actor.deathAt = performance.now();
		}
		scene.addFloater(`+$${score.toFixed(2)}`, endX, ENEMY_LANE_Y - 100, 0xffd95a, 1000);
		await sleep(450);
	},

	async chestBeat(multiplier: number) {
		scene.addFlash(0xffd95a, 250);
		scene.addBanner(`×${multiplier} CHEST`, 0xffd95a, 1400);
		await sleep(1400);
	},

	async potionBeat(durationMs: number, scoreGain: number) {
		const startScale = sceneState.heroScale;
		sceneState.heroScale = 1.4;
		scene.addBanner('POTION!', 0xa0ffa0, Math.min(durationMs, 1200));
		// Tick floaters across the buff window — break score into ~6 pops.
		const pops = 6;
		const per = scoreGain / pops;
		for (let i = 0; i < pops; i++) {
			scene.addFloater(`+$${per.toFixed(2)}`, HERO_X + 30, HERO_Y - 80 - i * 6, 0xa0ffa0, 700);
			await sleep(durationMs / pops);
		}
		sceneState.heroScale = startScale;
	},

	async powerdownBeat(scoreDelta: number) {
		scene.addFlash(0xff5566, 350);
		scene.addFloater(`-$${Math.abs(scoreDelta).toFixed(2)}`, HERO_X, HERO_Y - 60, 0xff5566, 900);
		await sleep(450);
	},

	async dragonSwoop(hit: boolean, scoreLoss: number) {
		const id = newId();
		const startX = SPAWN_X + 80;
		const endX = -120;
		const swoopMs = 1100;
		const vx = (endX - startX) / swoopMs;
		sceneState.actors.push({
			id,
			kind: 'dragon',
			textureKey: 'big/dragon',
			x: startX,
			y: 220,
			vx,
			vy: 0,
			scale: 0.36,
			alpha: 0.95,
			deathAt: null,
			expiresAt: performance.now() + swoopMs + 200,
		});
		if (hit) {
			await sleep(swoopMs * 0.6);
			scene.addFlash(0xff4422, 450);
			scene.addFloater(`-$${scoreLoss.toFixed(2)}`, HERO_X, HERO_Y - 60, 0xff4422, 1100);
			await sleep(swoopMs * 0.4 + 200);
		} else {
			await sleep(swoopMs);
		}
	},

	async spellBurst(color: number) {
		scene.addFlash(color, 220);
		await sleep(280);
	},

	async lightningBeat(outcome: 'penalty' | 'lightning_mode', delta: number, gain: number) {
		sceneState.skyDim = 0.7;
		scene.addFlash(0xeaeaff, 320);
		if (outcome === 'penalty') {
			scene.addBanner('LIGHTNING!', 0x88aaff, 900);
			scene.addFloater(`-$${Math.abs(delta).toFixed(2)}`, HERO_X, HERO_Y - 60, 0xff4488, 1100);
			await sleep(900);
		} else {
			scene.addBanner('LIGHTNING MODE', 0xeaeaff, 1400);
			const pops = 6;
			const per = gain / pops;
			for (let i = 0; i < pops; i++) {
				scene.addFloater(`+$${per.toFixed(2)}`, HERO_X + 20, HERO_Y - 80 - i * 6, 0xeaeaff, 700);
				await sleep(220);
			}
		}
		sceneState.skyDim = 0;
	},

	async bossEncounter(bossId: BossId, outcome: 'killed' | 'passed', scoreGain: number, isFinal: boolean) {
		const id = newId();
		sceneState.bossActive = { id, bossId, phase: 'enter' };
		const startX = SPAWN_X + 80;
		const endX = isFinal ? HERO_X + 200 : HERO_X + 180;
		const enterMs = 900;
		const vx = (endX - startX) / enterMs;
		sceneState.actors.push({
			id,
			kind: 'boss',
			textureKey: `boss/${bossId}`,
			x: startX,
			y: ENEMY_LANE_Y - 40,
			vx,
			vy: 0,
			scale: isFinal ? 0.7 : 0.55,
			alpha: 1,
			deathAt: null,
			expiresAt: performance.now() + 5000,
		});
		scene.addBanner(isFinal ? 'FINAL BOSS' : 'MINI BOSS', 0xffaa55, 1100);
		await sleep(enterMs);
		const a = sceneState.actors.find((x) => x.id === id);
		if (a) a.vx = 0;
		sceneState.bossActive = { id, bossId, phase: 'fight' };
		await sleep(800);
		if (outcome === 'killed') {
			scene.addFlash(0xff7733, 500);
			scene.addBanner('VANQUISHED', 0xffd95a, 1200);
			scene.addFloater(`+$${scoreGain.toFixed(2)}`, endX, ENEMY_LANE_Y - 120, 0xffd95a, 1300);
			if (a) {
				a.deathAt = performance.now();
				a.expiresAt = performance.now() + 600;
			}
			sceneState.bossActive = { id, bossId, phase: 'killed' };
			await sleep(700);
		} else {
			scene.addBanner('THE BEAST PASSES…', 0x886688, 1200);
			sceneState.bossActive = { id, bossId, phase: 'passed' };
			await sleep(1200);
		}
		sceneState.bossActive = null;
	},

	async ambushDeath(killerId: 'spontaneous_combustion' | 'banana_peel') {
		if (killerId === 'spontaneous_combustion') {
			// No warning — sprite-shatter pop.
			scene.addFlash(0xffaa66, 220);
			sceneState.heroShatter = 1;
			sceneState.heroDead = true;
			await sleep(1100);
		} else {
			// Banana slip — hero falls.
			scene.addBanner('SLIPPED!', 0xffe066, 900);
			sceneState.heroDead = true;
			await sleep(1300);
		}
	},

	async quietPause(durationMs: number) {
		await sleep(durationMs);
	},
};
