import type { BetType } from 'rgs-requests';

import type {
	HeroId,
	FodderSpriteId,
	BigEnemyId,
	BossId,
	BiomeId,
	ItemId,
	PickupEffectType,
	MountId,
	AllyId,
	SlowerKind,
	SpellKind,
	HazardId,
	HazardOutcome,
	AmbushKillerId,
	AmbushStyle,
	RoundResult,
} from './types';

// ---------------------------------------------------------------------------
// Slay the Beast — BookEvent contract (v1 base mode, 14 variants)
// ---------------------------------------------------------------------------
// All gameplay is driven by a pre-computed `book` returned by RGS. Each event
// is a fully-decided fact — the math-sdk rolls every RNG outcome offline, the
// client just renders them in order. No randomness is allowed at play time
// except purely cosmetic variation (death-direction, particle jitter, etc).
//
// Effect lifecycle rules the handler map must honour:
//   - `pickup` with effectType: 'persistent' applies a buff that stays until
//     the next `retaliation.effectsBroken[]` / `terrainHazard(outcome:'died')`
//     / `ambushDeath` clears it.
//   - `pickup` with effectType: 'timed' self-clears after durationMs.
//   - `pickup` with effectType: 'instant' applies once, no state.
//   - `skyRide`, `slower`, `ally` are bounded by durationMs (or the event's
//     natural length) and never leak into the next event.
//   - `retaliation.effectsBroken` MUST name every ItemId that was cleared, so
//     Storybook / the handler can animate each one breaking.
// ---------------------------------------------------------------------------

/** Fires once at the start of every round. Resets UI state. */
type BookEventRoundInit = {
	index: number;
	type: 'roundInit';
	heroId: HeroId;
	startingMultiplier: number;
	biomeId: BiomeId;
};

/** One wave of small enemies. Kills are drawn from `enemyTypes`. */
type BookEventFodderWave = {
	index: number;
	type: 'fodderWave';
	count: number;
	killValueEach: number;
	totalMultiplierGain: number;
	enemyTypes: FodderSpriteId[];
	largeFractionPct: number;
};

/** One big (mid-tier) enemy dies and awards a chunky multiplier gain. */
type BookEventBigEnemyKill = {
	index: number;
	type: 'bigEnemyKill';
	enemyId: BigEnemyId;
	multiplierGain: number;
};

/** Hero casts a spell. Cosmetic only — math drives damage via other events. */
type BookEventSpellAttack = {
	index: number;
	type: 'spellAttack';
	kind: SpellKind;
};

/**
 * Hero takes a hit: heart break + multiplier reduction + any persistent
 * pickups clear. Math pre-decides `multiplierAfter`; handler tweens the number.
 */
type BookEventRetaliation = {
	index: number;
	type: 'retaliation';
	multiplierBefore: number;
	multiplierAfter: number;
	effectsBroken: ItemId[];
};

/**
 * A multiplier-draining / pacing-loss hazard. No heart loss. `multiplierDelta`
 * is the total applied over `durationMs`; handler animates the drain.
 */
type BookEventSlower = {
	index: number;
	type: 'slower';
	kind: SlowerKind;
	durationMs: number;
	multiplierDelta: number;
};

/**
 * A floating item. `acquired: false` means it drifts past uncollected —
 * showing-then-missing is a deliberate fantasy, not a bug. When acquired,
 * `effectType` dictates lifecycle (see module docblock).
 */
type BookEventPickup = {
	index: number;
	type: 'pickup';
	itemId: ItemId;
	acquired: boolean;
	effectType: PickupEffectType;
	durationMs?: number;
	multiplierDelta?: number;
};

/**
 * Inline sky-ride cinematic — hero leaps on a mount, flies through a coin
 * stream, drops back to the battlefield. `coinStream` is the pre-decided
 * collection schedule; `totalMultiplierGain` is the sum of all stream values.
 */
type BookEventSkyRide = {
	index: number;
	type: 'skyRide';
	mountId: MountId;
	durationMs: number;
	coinStream: Array<{ t: number; value: number }>;
	totalMultiplierGain: number;
};

/** An ally joins for `durationMs` (or until broken by a retaliation). */
type BookEventAlly = {
	index: number;
	type: 'ally';
	allyId: AllyId;
	effect: string;
	durationMs?: number;
};

/**
 * Terrain moment. `outcome: 'cleared'` → hero jumps it, maybe gains a bonus.
 * `outcome: 'died'` → run ends here; handler dissolves into `ambushDeath`-
 * style cinematic BEFORE `roundEnd`.
 */
type BookEventTerrainHazard = {
	index: number;
	type: 'terrainHazard';
	hazardId: HazardId;
	outcome: HazardOutcome;
	multiplierDelta?: number;
};

/** Scroll stops, boss enters on its arena background. */
type BookEventBossEncounter = {
	index: number;
	type: 'bossEncounter';
	bossId: BossId;
	arenaId: BiomeId;
};

/** Boss dies. Round continues to `roundEnd`. */
type BookEventBossKill = {
	index: number;
	type: 'bossKill';
	multiplierGain: number;
};

/**
 * Instant / near-instant run-ender (non-hazard, non-retaliation). `style`
 * picks the animation budget — 'quick' ~1.5s, 'dramatic' ~4s cinematic.
 */
type BookEventAmbushDeath = {
	index: number;
	type: 'ambushDeath';
	killerId: AmbushKillerId;
	style: AmbushStyle;
};

/** Result reveal. `totalMultiplier` and `result` drive the overlay. */
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
	| BookEventSpellAttack
	| BookEventRetaliation
	| BookEventSlower
	| BookEventPickup
	| BookEventSkyRide
	| BookEventAlly
	| BookEventTerrainHazard
	| BookEventBossEncounter
	| BookEventBossKill
	| BookEventAmbushDeath
	| BookEventRoundEnd;

export type Bet = BetType<BookEvent>;
export type BookEventOfType<T> = Extract<BookEvent, { type: T }>;
export type BookEventContext = { bookEvents: BookEvent[] };
