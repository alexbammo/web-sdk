import type { BetType } from 'rgs-requests';

import type {
	HeroId,
	FodderSpriteId,
	BigEnemyId,
	BossId,
	RoundResult,
	AmbushReason,
} from './types';

type BookEventRoundInit = {
	index: number;
	type: 'roundInit';
	heroId: HeroId;
};

type BookEventFodderWave = {
	index: number;
	type: 'fodderWave';
	count: number;
	killValueEach: number;
	totalMultiplierGain: number;
	enemyTypes: FodderSpriteId[];
	largeFractionPct: number;
};

type BookEventBigEnemyKill = {
	index: number;
	type: 'bigEnemyKill';
	enemyId: BigEnemyId;
	multiplierGain: number;
};

type BookEventRetaliation = {
	index: number;
	type: 'retaliation';
	multiplierBefore: number;
	multiplierAfter: number;
};

type BookEventSpellAttack = {
	index: number;
	type: 'spellAttack';
	sourceSpriteId: FodderSpriteId;
	heartLost: 1;
};

type BookEventBossEncounter = {
	index: number;
	type: 'bossEncounter';
	bossId: BossId;
};

type BookEventBossKill = {
	index: number;
	type: 'bossKill';
	multiplierGain: number;
};

type BookEventAmbushDeath = {
	index: number;
	type: 'ambushDeath';
	reason: AmbushReason;
};

type BookEventRoundEnd = {
	index: number;
	type: 'roundEnd';
	totalMultiplier: number;
	result: RoundResult;
};

export type BookEvent =
	| BookEventRoundInit
	| BookEventFodderWave
	| BookEventBigEnemyKill
	| BookEventRetaliation
	| BookEventSpellAttack
	| BookEventBossEncounter
	| BookEventBossKill
	| BookEventAmbushDeath
	| BookEventRoundEnd;

export type Bet = BetType<BookEvent>;
export type BookEventOfType<T> = Extract<BookEvent, { type: T }>;
export type BookEventContext = { bookEvents: BookEvent[] };
