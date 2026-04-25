import type { BookEvent } from './typesBookEvent';
import { FODDER_SPRITE_IDS } from './types';
import { validateBook } from './validateBook';

export type MockBook = {
	id: number;
	events: BookEvent[];
	payoutMultiplier: number;
};

export type MockScenario =
	| 'win-big-chaos'
	| 'win-standard-ante'
	| 'loss-banana-base'
	| 'loss-combust-base'
	| 'win-lightning-mode-base'
	| 'win-mini-passed-base'
	| 'loss-final-passed-base';

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

const buildLossBananaBase = (id: number): MockBook => {
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
		{ index: 8, type: 'ambushDeath', killerId: 'banana_peel' },
		{ index: 9, type: 'roundEnd', payoutMultiplier: 0, result: 'loss' },
	];
	return { id, events, payoutMultiplier: 0 };
};

const buildLossCombustBase = (id: number): MockBook => {
	// Score trace: 0 +9 +6(big) +14 → spontaneous_combustion (no warning) → 0
	const events: BookEvent[] = [
		{ index: 0, type: 'roundInit', heroId: 'male_archer', biomeId: 'grasslands', mode: 'base' },
		{ index: 1, type: 'speedChange', tier: 'stroll' },
		{
			index: 2,
			type: 'fodderWave',
			size: 'trickle',
			count: 22,
			killValueEach: 0.41,
			totalScoreGain: 9,
			enemyTypes: FODDER_POOL,
		},
		{ index: 3, type: 'bigEnemyKill', enemyId: 'demon', scoreGain: 6 },
		{
			index: 4,
			type: 'fodderWave',
			size: 'horde',
			count: 50,
			killValueEach: 0.28,
			totalScoreGain: 14,
			enemyTypes: FODDER_POOL,
		},
		{ index: 5, type: 'ambushDeath', killerId: 'spontaneous_combustion' },
		{ index: 6, type: 'roundEnd', payoutMultiplier: 0, result: 'loss' },
	];
	return { id, events, payoutMultiplier: 0 };
};

// ---------------------------------------------------------------------------
// Coverage scenarios — exercise outcomes the original four mocks miss:
//   - lightning.outcome === 'lightning_mode'   (the 5% upside)
//   - miniBossFight.outcome === 'passed'       (round ends, score banked)
//   - finalBossFight.outcome === 'passed'      (loss, score forfeit — base only)
// ---------------------------------------------------------------------------

const buildWinLightningModeBase = (id: number): MockBook => {
	// Score trace: 0 +5(trickle) +0(lightning_mode kicks in) +25(buff yield) +10(mini) +20(final) = 60
	const events: BookEvent[] = [
		{ index: 0, type: 'roundInit', heroId: 'male_wizard', biomeId: 'grasslands', mode: 'base' },
		{ index: 1, type: 'speedChange', tier: 'stroll' },
		{
			index: 2,
			type: 'fodderWave',
			size: 'trickle',
			count: 18,
			killValueEach: 0.28,
			totalScoreGain: 5,
			enemyTypes: FODDER_POOL,
		},
		{
			index: 3,
			type: 'lightning',
			outcome: 'lightning_mode',
			scoreDelta: 0,
			buffDurationMs: 5000,
			scoreGainDuringBuff: 25,
		},
		{ index: 4, type: 'miniBossFight', bossId: 'behemoth', outcome: 'killed', scoreGain: 10 },
		{
			index: 5,
			type: 'finalBossFight',
			bossId: 'evil_king',
			arenaId: 'grasslands',
			outcome: 'killed',
			scoreGain: 20,
		},
		{ index: 6, type: 'roundEnd', payoutMultiplier: 60, result: 'win' },
	];
	return { id, events, payoutMultiplier: 60 };
};

const buildWinMiniPassedBase = (id: number): MockBook => {
	// Score trace: 0 +8(trickle) +6(big) +5(trickle) → mini PASSED (round ends, score banked) = 19
	// Mini-boss 'passed' is a round-ender that BANKS the cumulative score (not a loss).
	const events: BookEvent[] = [
		{ index: 0, type: 'roundInit', heroId: 'male_archer', biomeId: 'wasteland', mode: 'base' },
		{ index: 1, type: 'speedChange', tier: 'run' },
		{
			index: 2,
			type: 'fodderWave',
			size: 'trickle',
			count: 25,
			killValueEach: 0.32,
			totalScoreGain: 8,
			enemyTypes: FODDER_POOL,
		},
		{ index: 3, type: 'bigEnemyKill', enemyId: 'cyclops', scoreGain: 6 },
		{
			index: 4,
			type: 'fodderWave',
			size: 'horde',
			count: 30,
			killValueEach: 0.17,
			totalScoreGain: 5,
			enemyTypes: FODDER_POOL,
		},
		{ index: 5, type: 'miniBossFight', bossId: 'boss_dragon', outcome: 'passed', scoreGain: 0 },
		{ index: 6, type: 'roundEnd', payoutMultiplier: 19, result: 'win' },
	];
	return { id, events, payoutMultiplier: 19 };
};

const buildLossFinalPassedBase = (id: number): MockBook => {
	// Score trace: 0 +10(trickle) +5(big) +12(horde) +6(big) +10(mini) → final PASSED → 0
	// TODO(math-sdk): confirm finalBoss 'passed' forfeits cumulative score (→ 0). The contract
	// docstring at typesBookEvent.ts:174-187 reads "boss eats the hero, roundEnd(result:'loss')",
	// which we encode here as a forfeit. If math-sdk rules say "loss with current score banked",
	// flip payoutMultiplier here and update validateBook accordingly.
	const events: BookEvent[] = [
		{ index: 0, type: 'roundInit', heroId: 'male_warrior', biomeId: 'grasslands', mode: 'base' },
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
			count: 50,
			killValueEach: 0.24,
			totalScoreGain: 12,
			enemyTypes: FODDER_POOL,
		},
		{ index: 5, type: 'bigEnemyKill', enemyId: 'bear', scoreGain: 6 },
		{ index: 6, type: 'miniBossFight', bossId: 'behemoth', outcome: 'killed', scoreGain: 10 },
		{ index: 7, type: 'speedChange', tier: 'sprint' },
		{
			index: 8,
			type: 'finalBossFight',
			bossId: 'dark_lord',
			arenaId: 'wasteland',
			outcome: 'passed',
			scoreGain: 0,
		},
		{ index: 9, type: 'roundEnd', payoutMultiplier: 0, result: 'loss' },
	];
	return { id, events, payoutMultiplier: 0 };
};

export const buildMockBook = (scenario: MockScenario, id = 1): MockBook => {
	const book = (() => {
		switch (scenario) {
			case 'win-big-chaos':
				return buildWinBigChaos(id);
			case 'win-standard-ante':
				return buildWinStandardAnte(id);
			case 'loss-banana-base':
				return buildLossBananaBase(id);
			case 'loss-combust-base':
				return buildLossCombustBase(id);
			case 'win-lightning-mode-base':
				return buildWinLightningModeBase(id);
			case 'win-mini-passed-base':
				return buildWinMiniPassedBase(id);
			case 'loss-final-passed-base':
				return buildLossFinalPassedBase(id);
		}
	})();
	// Throws on bet-mode / structural violations. Crash fast in dev rather than
	// ship a broken book to the renderer.
	validateBook(book);
	return book;
};
