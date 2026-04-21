import type { BookEvent } from './typesBookEvent';
import { FODDER_SPRITE_IDS } from './types';

export type MockBook = {
	id: number;
	events: BookEvent[];
	payoutMultiplier: number;
};

export type MockScenario = 'win-big' | 'win-standard' | 'loss-ambush';

const FODDER_POOL = [...FODDER_SPRITE_IDS];

// ---------------------------------------------------------------------------
// Mock books for Phase C porting + reviewer handoff. Collectively these three
// scenarios hit 13/14 variants. terrainHazard(outcome:'died') is defined in
// typesBookEvent.ts but not exercised here — cover via Storybook in Phase C.
// ---------------------------------------------------------------------------

const buildWinBig = (id: number): MockBook => {
	// 1 + 10 + 15 + 5 + 2 + 25 + 12 = 70 → retaliation → 35 + 20 + 8 + 50 = 113
	const events: BookEvent[] = [
		{
			index: 0,
			type: 'roundInit',
			heroId: 'male_warrior',
			startingMultiplier: 1,
			biomeId: 'grasslands',
		},
		{
			index: 1,
			type: 'fodderWave',
			count: 50,
			killValueEach: 0.2,
			totalMultiplierGain: 10,
			enemyTypes: FODDER_POOL,
			largeFractionPct: 5,
		},
		{
			index: 2,
			type: 'pickup',
			itemId: 'fire_sword',
			acquired: true,
			effectType: 'persistent',
		},
		{
			index: 3,
			type: 'fodderWave',
			count: 60,
			killValueEach: 0.25,
			totalMultiplierGain: 15,
			enemyTypes: FODDER_POOL,
			largeFractionPct: 8,
		},
		{ index: 4, type: 'bigEnemyKill', enemyId: 'dragon', multiplierGain: 5 },
		{ index: 5, type: 'spellAttack', kind: 'fire' },
		{
			index: 6,
			type: 'pickup',
			itemId: 'gold_coin',
			acquired: true,
			effectType: 'instant',
			multiplierDelta: 2,
		},
		{
			index: 7,
			type: 'pickup',
			itemId: 'magic_rune',
			acquired: false,
			effectType: 'persistent',
		},
		{
			index: 8,
			type: 'skyRide',
			mountId: 'unicorn',
			durationMs: 6000,
			coinStream: [
				{ t: 500, value: 3 },
				{ t: 1500, value: 5 },
				{ t: 2700, value: 4 },
				{ t: 3800, value: 6 },
				{ t: 5200, value: 7 },
			],
			totalMultiplierGain: 25,
		},
		{
			index: 9,
			type: 'fodderWave',
			count: 55,
			killValueEach: 0.22,
			totalMultiplierGain: 12,
			enemyTypes: FODDER_POOL,
			largeFractionPct: 5,
		},
		{
			index: 10,
			type: 'retaliation',
			multiplierBefore: 70,
			multiplierAfter: 35,
			effectsBroken: ['fire_sword'],
		},
		{
			index: 11,
			type: 'pickup',
			itemId: 'giant_potion',
			acquired: true,
			effectType: 'persistent',
		},
		{
			index: 12,
			type: 'fodderWave',
			count: 80,
			killValueEach: 0.25,
			totalMultiplierGain: 20,
			enemyTypes: FODDER_POOL,
			largeFractionPct: 10,
		},
		{ index: 13, type: 'bigEnemyKill', enemyId: 'cyclops', multiplierGain: 8 },
		{ index: 14, type: 'bossEncounter', bossId: 'boss_dragon', arenaId: 'wasteland' },
		{ index: 15, type: 'bossKill', multiplierGain: 50 },
		{ index: 16, type: 'roundEnd', totalMultiplier: 113, result: 'win' },
	];
	return { id, events, payoutMultiplier: 11300 };
};

const buildWinStandard = (id: number): MockBook => {
	// 1 + 8 - 2 + 12 + 4 + 3 + 10 + 20 = 56
	const events: BookEvent[] = [
		{
			index: 0,
			type: 'roundInit',
			heroId: 'male_knight',
			startingMultiplier: 1,
			biomeId: 'grasslands',
		},
		{
			index: 1,
			type: 'fodderWave',
			count: 40,
			killValueEach: 0.2,
			totalMultiplierGain: 8,
			enemyTypes: FODDER_POOL,
			largeFractionPct: 5,
		},
		{
			index: 2,
			type: 'slower',
			kind: 'storm_cloud',
			durationMs: 2500,
			multiplierDelta: -2,
		},
		{ index: 3, type: 'ally', allyId: 'wolf', effect: 'extra_kill_per_wave', durationMs: 8000 },
		{
			index: 4,
			type: 'fodderWave',
			count: 50,
			killValueEach: 0.24,
			totalMultiplierGain: 12,
			enemyTypes: FODDER_POOL,
			largeFractionPct: 6,
		},
		{ index: 5, type: 'bigEnemyKill', enemyId: 'bear', multiplierGain: 4 },
		{
			index: 6,
			type: 'terrainHazard',
			hazardId: 'chasm',
			outcome: 'cleared',
			multiplierDelta: 3,
		},
		{
			index: 7,
			type: 'fodderWave',
			count: 45,
			killValueEach: 0.22,
			totalMultiplierGain: 10,
			enemyTypes: FODDER_POOL,
			largeFractionPct: 5,
		},
		{ index: 8, type: 'bossEncounter', bossId: 'behemoth', arenaId: 'grasslands' },
		{ index: 9, type: 'bossKill', multiplierGain: 20 },
		{ index: 10, type: 'roundEnd', totalMultiplier: 56, result: 'win' },
	];
	return { id, events, payoutMultiplier: 5600 };
};

const buildLossAmbush = (id: number): MockBook => {
	// 1 + 10 - 3 + 8 = 16 → retaliation → 8 + 5 + 3 = 16 → ambushDeath → 0
	const events: BookEvent[] = [
		{
			index: 0,
			type: 'roundInit',
			heroId: 'male_thief',
			startingMultiplier: 1,
			biomeId: 'wasteland',
		},
		{
			index: 1,
			type: 'fodderWave',
			count: 45,
			killValueEach: 0.22,
			totalMultiplierGain: 10,
			enemyTypes: FODDER_POOL,
			largeFractionPct: 5,
		},
		{ index: 2, type: 'slower', kind: 'swamp', durationMs: 3000, multiplierDelta: -3 },
		{
			index: 3,
			type: 'fodderWave',
			count: 35,
			killValueEach: 0.23,
			totalMultiplierGain: 8,
			enemyTypes: FODDER_POOL,
			largeFractionPct: 4,
		},
		{
			index: 4,
			type: 'pickup',
			itemId: 'lucky_ring',
			acquired: true,
			effectType: 'persistent',
		},
		{ index: 5, type: 'spellAttack', kind: 'lightning' },
		{
			index: 6,
			type: 'retaliation',
			multiplierBefore: 16,
			multiplierAfter: 8,
			effectsBroken: ['lucky_ring'],
		},
		{
			index: 7,
			type: 'terrainHazard',
			hazardId: 'spike_trap',
			outcome: 'cleared',
			multiplierDelta: 0,
		},
		{
			index: 8,
			type: 'fodderWave',
			count: 25,
			killValueEach: 0.2,
			totalMultiplierGain: 5,
			enemyTypes: FODDER_POOL,
			largeFractionPct: 3,
		},
		{ index: 9, type: 'bigEnemyKill', enemyId: 'demon', multiplierGain: 3 },
		{ index: 10, type: 'ambushDeath', killerId: 'banana_peel', style: 'quick' },
		{ index: 11, type: 'roundEnd', totalMultiplier: 0, result: 'loss' },
	];
	return { id, events, payoutMultiplier: 0 };
};

export const buildMockBook = (scenario: MockScenario, id = 1): MockBook => {
	switch (scenario) {
		case 'win-big':
			return buildWinBig(id);
		case 'win-standard':
			return buildWinStandard(id);
		case 'loss-ambush':
			return buildLossAmbush(id);
	}
};
