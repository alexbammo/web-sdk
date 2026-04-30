import type { BookEventHandlerMap } from 'utils-book';

import { eventEmitter } from './eventEmitter';
import { stateGame } from './stateGame.svelte';
import { scene } from './scene/sceneController.svelte';
import type { BookEvent, BookEventContext, BookEventOfType } from './typesBookEvent';
import type { SpellKind } from './types';

// Phase C — Stream 2. Handlers mutate score state (unchanged from Stream 1) and
// drive the gameplay layer via the imperative `scene.*` API. The dispatcher
// awaits each handler, so render fns that resolve when their visual beat ends
// keep dispatcher pacing aligned with the on-screen action.

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const SPELL_COLOR: Record<SpellKind, number> = {
	fire: 0xff8844,
	ice: 0x88ccff,
	lightning: 0xeaeaff,
	arcane: 0xcc88ff,
};

export const bookEventHandlerMap: BookEventHandlerMap<BookEvent, BookEventContext> = {
	roundInit: async (event: BookEventOfType<'roundInit'>) => {
		stateGame.heroId = event.heroId;
		stateGame.biomeId = event.biomeId;
		stateGame.mode = event.mode;
		stateGame.cumulativeScore = 0;
		stateGame.lastResult = null;
		stateGame.lastPayout = 0;
		stateGame.isPlaying = true;
		scene.reset(event.heroId, event.biomeId, event.mode);
		eventEmitter.broadcast({ type: 'roundStart' });
	},
	quietBeat: async (event: BookEventOfType<'quietBeat'>) => {
		await scene.quietPause(event.durationMs);
	},
	speedChange: async () => {
		// No visual today; scroll-speed concept is decorative for v1.
	},
	fodderWave: async (event: BookEventOfType<'fodderWave'>) => {
		stateGame.cumulativeScore += event.totalScoreGain;
		eventEmitter.broadcast({ type: 'scoreUpdate', cumulative: stateGame.cumulativeScore });
		const perKill = event.totalScoreGain / Math.max(1, event.count);
		const stagger = event.size === 'trickle' ? 240 : 90;
		const promises: Promise<void>[] = [];
		for (let i = 0; i < event.count; i++) {
			promises.push(
				(async () => {
					await sleep(i * stagger);
					await scene.spawnFodderKill(perKill, 700);
				})(),
			);
		}
		await Promise.all(promises);
	},
	bigEnemyKill: async (event: BookEventOfType<'bigEnemyKill'>) => {
		stateGame.cumulativeScore += event.scoreGain;
		eventEmitter.broadcast({ type: 'scoreUpdate', cumulative: stateGame.cumulativeScore });
		await scene.spawnBigEnemyKill(event.enemyId, event.scoreGain);
	},
	spellAttack: async (event: BookEventOfType<'spellAttack'>) => {
		await scene.spellBurst(SPELL_COLOR[event.kind]);
	},
	potion: async (event: BookEventOfType<'potion'>) => {
		stateGame.cumulativeScore += event.scoreGainDuringBuff;
		eventEmitter.broadcast({ type: 'scoreUpdate', cumulative: stateGame.cumulativeScore });
		await scene.potionBeat(event.durationMs, event.scoreGainDuringBuff);
	},
	powerdown: async (event: BookEventOfType<'powerdown'>) => {
		stateGame.cumulativeScore = Math.max(0, stateGame.cumulativeScore + event.scoreDelta);
		eventEmitter.broadcast({ type: 'scoreUpdate', cumulative: stateGame.cumulativeScore });
		await scene.powerdownBeat(event.scoreDelta);
	},
	flyingDragon: async (event: BookEventOfType<'flyingDragon'>) => {
		if (event.hit) {
			stateGame.cumulativeScore = Math.max(0, stateGame.cumulativeScore - event.scoreLoss);
			eventEmitter.broadcast({ type: 'scoreUpdate', cumulative: stateGame.cumulativeScore });
		}
		await scene.dragonSwoop(event.hit, event.scoreLoss);
	},
	chest: async (event: BookEventOfType<'chest'>) => {
		stateGame.cumulativeScore = stateGame.cumulativeScore * event.multiplier;
		eventEmitter.broadcast({ type: 'scoreUpdate', cumulative: stateGame.cumulativeScore });
		await scene.chestBeat(event.multiplier);
	},
	lightning: async (event: BookEventOfType<'lightning'>) => {
		if (event.outcome === 'penalty') {
			stateGame.cumulativeScore = Math.max(0, stateGame.cumulativeScore + event.scoreDelta);
			eventEmitter.broadcast({ type: 'scoreUpdate', cumulative: stateGame.cumulativeScore });
			await scene.lightningBeat('penalty', event.scoreDelta, 0);
		} else {
			stateGame.cumulativeScore += event.scoreGainDuringBuff;
			eventEmitter.broadcast({ type: 'scoreUpdate', cumulative: stateGame.cumulativeScore });
			await scene.lightningBeat('lightning_mode', 0, event.scoreGainDuringBuff);
		}
	},
	miniBossFight: async (event: BookEventOfType<'miniBossFight'>) => {
		if (event.outcome === 'killed') {
			stateGame.cumulativeScore += event.scoreGain;
			eventEmitter.broadcast({ type: 'scoreUpdate', cumulative: stateGame.cumulativeScore });
		}
		await scene.bossEncounter(event.bossId, event.outcome, event.scoreGain, false);
	},
	finalBossFight: async (event: BookEventOfType<'finalBossFight'>) => {
		if (event.outcome === 'killed') {
			stateGame.cumulativeScore += event.scoreGain;
			eventEmitter.broadcast({ type: 'scoreUpdate', cumulative: stateGame.cumulativeScore });
		}
		await scene.bossEncounter(event.bossId, event.outcome, event.scoreGain, true);
	},
	ambushDeath: async (event: BookEventOfType<'ambushDeath'>) => {
		await scene.ambushDeath(event.killerId);
	},
	roundEnd: async (event: BookEventOfType<'roundEnd'>) => {
		stateGame.lastResult = event.result;
		stateGame.lastPayout = event.payoutMultiplier;
		stateGame.isPlaying = false;
		await eventEmitter.broadcastAsync({
			type: 'roundEndShow',
			payoutMultiplier: event.payoutMultiplier,
			result: event.result,
		});
	},
};
