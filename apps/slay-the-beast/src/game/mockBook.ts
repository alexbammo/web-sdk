import type { BookEvent } from './typesBookEvent';
import { FODDER_SPRITE_IDS } from './types';

export type MockBook = {
	id: number;
	events: BookEvent[];
	payoutMultiplier: number;
};

export type MockScenario = 'win-big-chaos' | 'win-standard-ante' | 'loss-ambush-base';

const FODDER_POOL = [...FODDER_SPRITE_IDS];

// ---------------------------------------------------------------------------
// Mock books for Phase 1 (math-sdk) reference + reviewer handoff. Three
// scenarios collectively exercise all 15 book-event variants across the
// three bet modes. Hand-rolled numbers — the Python sim will replace these.
// ---------------------------------------------------------------------------

const buildWinBigChaos = (id: number): MockBook => {
	// Score trace: 0 +10 +5 +15 +20(potion) +0(dodge) ×10(chest)=500 +30 +25(mini) +200(final) = 755
	const events: BookEvent[] = [
		{ index: 0, type: 'roundInit', heroId: 'male_warrior', biomeId: 'grasslands', mode: 'chaos' },
		{ index: 1, type: 'speedChange', tier: 'run' },
		{
			index: 2,
			type: 'fodderWave',
			size: 'trickle',
			count: 30,
			killValueEach: 0.33,
			totalScoreGain: 10,
			enemyTypes: FODDER_POOL,
		},
		{ index: 3, type: 'bigEnemyKill', enemyId: 'dragon', scoreGain: 5 },
		{
			index: 4,
			type: 'fodderWave',
			size: 'horde',
			count: 60,
			killValueEach: 0.25,
			totalScoreGain: 15,
			enemyTypes: FODDER_POOL,
		},
		{ index: 5, type: 'spellAttack', kind: 'fire' },
		{ index: 6, type: 'potion', durationMs: 6000, scoreGainDuringBuff: 20 },
		{ index: 7, type: 'flyingDragon', attackType: 'fireball', hit: false, scoreLoss: 0 },
		{ index: 8, type: 'chest', multiplier: 10 },
		{
			index: 9,
			type: 'fodderWave',
			size: 'horde',
			count: 70,
			killValueEach: 0.43,
			totalScoreGain: 30,
			enemyTypes: FODDER_POOL,
		},
		{ index: 10, type: 'miniBossFight', bossId: 'boss_dragon', outcome: 'killed', scoreGain: 25 },
		{ index: 11, type: 'speedChange', tier: 'sprint' },
		{
			index: 12,
			type: 'finalBossFight',
			bossId: 'dark_lord',
			arenaId: 'wasteland',
			outcome: 'killed',
			scoreGain: 200,
		},
		{ index: 13, type: 'roundEnd', payoutMultiplier: 755, result: 'win' },
	];
	return { id, events, payoutMultiplier: 755 };
};

const buildWinStandardAnte = (id: number): MockBook => {
	// Score trace: 0 +8 -3(lightning) +15 +4(big) +10(potion) ×2(chest)=68 +12(mini) +40(final) = 120
	const events: BookEvent[] = [
		{ index: 0, type: 'roundInit', heroId: 'male_knight', biomeId: 'grasslands', mode: 'ante' },
		{ index: 1, type: 'speedChange', tier: 'stroll' },
		{
			index: 2,
			type: 'fodderWave',
			size: 'trickle',
			count: 25,
			killValueEach: 0.32,
			totalScoreGain: 8,
			enemyTypes: FODDER_POOL,
		},
		{ index: 3, type: 'lightning', outcome: 'penalty', scoreDelta: -3 },
		{
			index: 4,
			type: 'fodderWave',
			size: 'horde',
			count: 55,
			killValueEach: 0.27,
			totalScoreGain: 15,
			enemyTypes: FODDER_POOL,
		},
		{ index: 5, type: 'bigEnemyKill', enemyId: 'cyclops', scoreGain: 4 },
		{ index: 6, type: 'potion', durationMs: 4000, scoreGainDuringBuff: 10 },
		{ index: 7, type: 'chest', multiplier: 2 },
		{ index: 8, type: 'miniBossFight', bossId: 'behemoth', outcome: 'killed', scoreGain: 12 },
		{
			index: 9,
			type: 'finalBossFight',
			bossId: 'evil_king',
			arenaId: 'grasslands',
			outcome: 'killed',
			scoreGain: 40,
		},
		{ index: 10, type: 'roundEnd', payoutMultiplier: 120, result: 'win' },
	];
	return { id, events, payoutMultiplier: 120 };
};

const buildLossAmbushBase = (id: number): MockBook => {
	// Score trace: 0 +12 -5(trap) +10 -8(dragon hit) +3(big) → ambushDeath → 0
	const events: BookEvent[] = [
		{ index: 0, type: 'roundInit', heroId: 'male_thief', biomeId: 'wasteland', mode: 'base' },
		{ index: 1, type: 'speedChange', tier: 'run' },
		{
			index: 2,
			type: 'fodderWave',
			size: 'trickle',
			count: 30,
			killValueEach: 0.4,
			totalScoreGain: 12,
			enemyTypes: FODDER_POOL,
		},
		{ index: 3, type: 'powerdown', flavour: 'trap', scoreDelta: -5 },
		{ index: 4, type: 'quietBeat', durationMs: 800 },
		{
			index: 5,
			type: 'fodderWave',
			size: 'horde',
			count: 45,
			killValueEach: 0.22,
			totalScoreGain: 10,
			enemyTypes: FODDER_POOL,
		},
		{ index: 6, type: 'flyingDragon', attackType: 'poop', hit: true, scoreLoss: 8 },
		{ index: 7, type: 'bigEnemyKill', enemyId: 'bear', scoreGain: 3 },
		{ index: 8, type: 'ambushDeath', killerId: 'banana_peel', style: 'quick' },
		{ index: 9, type: 'roundEnd', payoutMultiplier: 0, result: 'loss' },
	];
	return { id, events, payoutMultiplier: 0 };
};

export const buildMockBook = (scenario: MockScenario, id = 1): MockBook => {
	switch (scenario) {
		case 'win-big-chaos':
			return buildWinBigChaos(id);
		case 'win-standard-ante':
			return buildWinStandardAnte(id);
		case 'loss-ambush-base':
			return buildLossAmbushBase(id);
	}
};
