import type { BookEventHandlerMap } from 'utils-book';

import { eventEmitter } from './eventEmitter';
import { stateGame } from './stateGame.svelte';
import type { BookEvent, BookEventContext, BookEventOfType } from './typesBookEvent';

// Stream 1 (Phase C): roundInit + roundEnd are wired so SPIN end-to-end demonstrates
// the dispatcher running cleanly. The 13 body handlers stay as no-op stubs and will
// land in Stream 2 alongside the prototype-portrait visual port.

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const bookEventHandlerMap: BookEventHandlerMap<BookEvent, BookEventContext> = {
	roundInit: async (event: BookEventOfType<'roundInit'>) => {
		stateGame.heroId = event.heroId;
		stateGame.biomeId = event.biomeId;
		stateGame.mode = event.mode;
		stateGame.cumulativeScore = 0;
		stateGame.lastResult = null;
		stateGame.lastPayout = 0;
		stateGame.isPlaying = true;
		eventEmitter.broadcast({ type: 'roundStart' });
	},
	quietBeat: async (event: BookEventOfType<'quietBeat'>) => {
		await sleep(event.durationMs);
	},
	speedChange: async () => {},
	fodderWave: async (event: BookEventOfType<'fodderWave'>) => {
		stateGame.cumulativeScore += event.totalScoreGain;
		eventEmitter.broadcast({ type: 'scoreUpdate', cumulative: stateGame.cumulativeScore });
	},
	bigEnemyKill: async (event: BookEventOfType<'bigEnemyKill'>) => {
		stateGame.cumulativeScore += event.scoreGain;
		eventEmitter.broadcast({ type: 'scoreUpdate', cumulative: stateGame.cumulativeScore });
	},
	spellAttack: async () => {},
	potion: async (event: BookEventOfType<'potion'>) => {
		stateGame.cumulativeScore += event.scoreGainDuringBuff;
		eventEmitter.broadcast({ type: 'scoreUpdate', cumulative: stateGame.cumulativeScore });
	},
	powerdown: async (event: BookEventOfType<'powerdown'>) => {
		stateGame.cumulativeScore = Math.max(0, stateGame.cumulativeScore + event.scoreDelta);
		eventEmitter.broadcast({ type: 'scoreUpdate', cumulative: stateGame.cumulativeScore });
	},
	flyingDragon: async (event: BookEventOfType<'flyingDragon'>) => {
		if (event.hit) {
			stateGame.cumulativeScore = Math.max(0, stateGame.cumulativeScore - event.scoreLoss);
			eventEmitter.broadcast({ type: 'scoreUpdate', cumulative: stateGame.cumulativeScore });
		}
	},
	chest: async (event: BookEventOfType<'chest'>) => {
		stateGame.cumulativeScore = stateGame.cumulativeScore * event.multiplier;
		eventEmitter.broadcast({ type: 'scoreUpdate', cumulative: stateGame.cumulativeScore });
	},
	lightning: async (event: BookEventOfType<'lightning'>) => {
		if (event.outcome === 'penalty') {
			stateGame.cumulativeScore = Math.max(0, stateGame.cumulativeScore + event.scoreDelta);
		} else {
			stateGame.cumulativeScore += event.scoreGainDuringBuff;
		}
		eventEmitter.broadcast({ type: 'scoreUpdate', cumulative: stateGame.cumulativeScore });
	},
	miniBossFight: async (event: BookEventOfType<'miniBossFight'>) => {
		if (event.outcome === 'killed') {
			stateGame.cumulativeScore += event.scoreGain;
			eventEmitter.broadcast({ type: 'scoreUpdate', cumulative: stateGame.cumulativeScore });
		}
	},
	finalBossFight: async (event: BookEventOfType<'finalBossFight'>) => {
		if (event.outcome === 'killed') {
			stateGame.cumulativeScore += event.scoreGain;
			eventEmitter.broadcast({ type: 'scoreUpdate', cumulative: stateGame.cumulativeScore });
		}
	},
	ambushDeath: async () => {},
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
