import type { BookEvent } from './typesBookEvent';
import { FODDER_SPRITE_IDS } from './types';

export type MockBook = {
	id: number;
	events: BookEvent[];
	payoutMultiplier: number;
};

export type MockScenario = 'win' | 'loss';

const FODDER_POOL = [...FODDER_SPRITE_IDS];

export const buildMockBook = (scenario: MockScenario, id = 1): MockBook => {
	if (scenario === 'loss') {
		const events: BookEvent[] = [
			{ index: 0, type: 'roundInit', heroId: 'male_warrior' },
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
				type: 'fodderWave',
				count: 60,
				killValueEach: 0.2,
				totalMultiplierGain: 12,
				enemyTypes: FODDER_POOL,
				largeFractionPct: 5,
			},
			{ index: 3, type: 'bigEnemyKill', enemyId: 'dragon', multiplierGain: 2 },
			{
				index: 4,
				type: 'fodderWave',
				count: 50,
				killValueEach: 0.3,
				totalMultiplierGain: 15,
				enemyTypes: FODDER_POOL,
				largeFractionPct: 5,
			},
			{ index: 5, type: 'spellAttack', sourceSpriteId: 'monster_04', heartLost: 1 },
			{
				index: 6,
				type: 'fodderWave',
				count: 70,
				killValueEach: 0.2,
				totalMultiplierGain: 14,
				enemyTypes: FODDER_POOL,
				largeFractionPct: 5,
			},
			{ index: 7, type: 'retaliation', multiplierBefore: 53, multiplierAfter: 26.5 },
			{
				index: 8,
				type: 'fodderWave',
				count: 50,
				killValueEach: 0.3,
				totalMultiplierGain: 15,
				enemyTypes: FODDER_POOL,
				largeFractionPct: 5,
			},
			{ index: 9, type: 'bigEnemyKill', enemyId: 'cyclops', multiplierGain: 2 },
			{ index: 10, type: 'spellAttack', sourceSpriteId: 'monster_07', heartLost: 1 },
			{ index: 11, type: 'ambushDeath', reason: 'ambush' },
			{ index: 12, type: 'roundEnd', totalMultiplier: 0, result: 'loss' },
		];
		return { id, events, payoutMultiplier: 0 };
	}

	const events: BookEvent[] = [
		{ index: 0, type: 'roundInit', heroId: 'male_knight' },
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
			type: 'fodderWave',
			count: 60,
			killValueEach: 0.2,
			totalMultiplierGain: 12,
			enemyTypes: FODDER_POOL,
			largeFractionPct: 5,
		},
		{ index: 3, type: 'bigEnemyKill', enemyId: 'dragon', multiplierGain: 2 },
		{
			index: 4,
			type: 'fodderWave',
			count: 50,
			killValueEach: 0.3,
			totalMultiplierGain: 15,
			enemyTypes: FODDER_POOL,
			largeFractionPct: 5,
		},
		{ index: 5, type: 'spellAttack', sourceSpriteId: 'monster_04', heartLost: 1 },
		{
			index: 6,
			type: 'fodderWave',
			count: 70,
			killValueEach: 0.2,
			totalMultiplierGain: 14,
			enemyTypes: FODDER_POOL,
			largeFractionPct: 5,
		},
		{
			index: 7,
			type: 'fodderWave',
			count: 60,
			killValueEach: 0.3,
			totalMultiplierGain: 18,
			enemyTypes: FODDER_POOL,
			largeFractionPct: 5,
		},
		{ index: 8, type: 'retaliation', multiplierBefore: 71, multiplierAfter: 35.5 },
		{
			index: 9,
			type: 'fodderWave',
			count: 50,
			killValueEach: 0.2,
			totalMultiplierGain: 10,
			enemyTypes: FODDER_POOL,
			largeFractionPct: 5,
		},
		{
			index: 10,
			type: 'fodderWave',
			count: 40,
			killValueEach: 0.5,
			totalMultiplierGain: 20,
			enemyTypes: FODDER_POOL,
			largeFractionPct: 5,
		},
		{ index: 11, type: 'bossEncounter', bossId: 'boss_dragon' },
		{ index: 12, type: 'bossKill', multiplierGain: 50 },
		{ index: 13, type: 'roundEnd', totalMultiplier: 115.5, result: 'win' },
	];
	return { id, events, payoutMultiplier: Math.round(115.5 * 100) };
};
