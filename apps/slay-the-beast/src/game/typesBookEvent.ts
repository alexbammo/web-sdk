import type { BetType } from 'rgs-requests';

import type {
	HeroId,
	FodderSpriteId,
	BigEnemyId,
	BossId,
	BiomeId,
	SpellKind,
	SpeedTier,
	WaveSize,
	PowerdownFlavour,
	DragonAttackType,
	AmbushKillerId,
	BetMode,
	RoundResult,
} from './types';

// ---------------------------------------------------------------------------
// Slay the Beast — BookEvent contract (prototype-aligned, v2)
// ---------------------------------------------------------------------------
// All gameplay is driven by a pre-computed `book` returned by RGS. Each event
// is a fully-decided fact — the math-sdk rolls every RNG outcome offline, the
// client just renders them in order. No randomness at play time except
// purely cosmetic variation (death-direction, particle jitter, etc).
//
// Scoring model (dollar-score, matches prototype):
//   - Score starts at 0, accrues in wager-unit deltas via per-event fields
//     (killValueEach, scoreGain, scoreDelta).
//   - A `chest` event is a LITERAL multiplier applied to the cumulative score.
//   - Passive scroll payout, if any, is pre-accumulated into the surrounding
//     event's `scoreGain` — it is not its own variant.
//   - Book-level `payoutMultiplier` is the total round score in wager units.
//
// Bet-mode rules the math-sdk must uphold:
//   - `base`     : full vocab. `ambushDeath` and `finalBossFight(passed)`
//                  occur at GDD-target rates (~15–20% combined).
//   - `ante`     : no `ambushDeath`, no `finalBossFight(passed)`. Cost 5×.
//   - `chaos`    : same as `ante`, plus always reaches `finalBossFight`.
//                  Cost 100×. The renderer lights the hero with a power glow
//                  whenever `roundInit.mode === 'chaos'`.
// ---------------------------------------------------------------------------

/** Fires once at the start of every round. Resets UI and sets the bet mode. */
type BookEventRoundInit = {
	index: number;
	type: 'roundInit';
	heroId: HeroId;
	biomeId: BiomeId;
	mode: BetMode;
};

/** Empty beat — scroll continues, nothing spawns. `durationMs` bounds the pause. */
type BookEventQuietBeat = {
	index: number;
	type: 'quietBeat';
	durationMs: number;
};

/** Scroll-speed change. Purely pacing; no score impact. */
type BookEventSpeedChange = {
	index: number;
	type: 'speedChange';
	tier: SpeedTier;
};

/**
 * One batch of fodder kills. `size: 'trickle'` spreads them out, `'horde'`
 * clumps them. `totalScoreGain` is the sum the HUD should land on when the
 * wave is done; `killValueEach` is cosmetic per-kill granularity.
 */
type BookEventFodderWave = {
	index: number;
	type: 'fodderWave';
	size: WaveSize;
	count: number;
	killValueEach: number;
	totalScoreGain: number;
	enemyTypes: FodderSpriteId[];
};

/** One big (mid-tier) enemy dies and awards a chunky score gain. */
type BookEventBigEnemyKill = {
	index: number;
	type: 'bigEnemyKill';
	enemyId: BigEnemyId;
	scoreGain: number;
};

/** Hero casts a spell. Cosmetic only — math drives score via other events. */
type BookEventSpellAttack = {
	index: number;
	type: 'spellAttack';
	kind: SpellKind;
};

/**
 * Giant potion pickup. Hero scales up and doubles kill values for `durationMs`.
 * `scoreGainDuringBuff` is the pre-decided total the wave beats inside the
 * buff window should sum to — the handler just animates toward it.
 */
type BookEventPotion = {
	index: number;
	type: 'potion';
	durationMs: number;
	scoreGainDuringBuff: number;
};

/**
 * Powerdown — score loss without death. `trap` = bear trap, `thief` = coin
 * thief chase, `curse` = passing curse cloud. `scoreDelta` is negative.
 */
type BookEventPowerdown = {
	index: number;
	type: 'powerdown';
	flavour: PowerdownFlavour;
	scoreDelta: number;
};

/**
 * Flying dragon swoop. `hit: true` means the dragon connects and applies
 * `scoreLoss` (usually ~50% of current score); `hit: false` means the hero
 * evades and nothing is lost.
 */
type BookEventFlyingDragon = {
	index: number;
	type: 'flyingDragon';
	attackType: DragonAttackType;
	hit: boolean;
	scoreLoss: number;
};

/**
 * Chest pickup. `multiplier` is LITERAL — the cumulative score is multiplied
 * by this value when the chest is collected. Banner text must show the same
 * number the math applies. A 10× chest visually/numerically 10×s the score.
 */
type BookEventChest = {
	index: number;
	type: 'chest';
	multiplier: number;
};

/**
 * Lightning strike (portrait vocab). Discriminated on `outcome`:
 *  - `penalty`        — 95% case. `scoreDelta` is a flat negative loss.
 *  - `lightning_mode` — 5% case. Hero enters an auto-zap buff for
 *    `buffDurationMs`; `scoreGainDuringBuff` sums the pre-decided auto-kill
 *    yield during the buff. No score penalty.
 *
 * Splitting the union forces the math-sdk to populate the buff fields when
 * it emits `lightning_mode`, and forbids stray buff fields on `penalty`.
 */
type BookEventLightningPenalty = {
	index: number;
	type: 'lightning';
	outcome: 'penalty';
	scoreDelta: number;
};

type BookEventLightningMode = {
	index: number;
	type: 'lightning';
	outcome: 'lightning_mode';
	scoreDelta: 0;
	buffDurationMs: number;
	scoreGainDuringBuff: number;
};

type BookEventLightning = BookEventLightningPenalty | BookEventLightningMode;

/**
 * Mini-boss fight. `outcome: 'killed'` awards `scoreGain` and the round
 * continues. `outcome: 'passed'` means the mini-boss walks off without
 * dying — round ends here at current score (still a "win" if >0). The
 * renderer tints the mini-boss menacingly and dissolves the scene.
 */
type BookEventMiniBossFight = {
	index: number;
	type: 'miniBossFight';
	bossId: BossId;
	outcome: 'killed' | 'passed';
	scoreGain: number;
};

/**
 * Final-boss fight. `outcome: 'killed'` → `scoreGain` applied, then
 * `roundEnd(result:'win')`. `outcome: 'passed'` → boss eats the hero,
 * `roundEnd(result:'loss')` with current score. CHAOS and ANTE modes
 * never emit `outcome: 'passed'` here.
 */
type BookEventFinalBossFight = {
	index: number;
	type: 'finalBossFight';
	bossId: BossId;
	arenaId: BiomeId;
	outcome: 'killed' | 'passed';
	scoreGain: number;
};

/**
 * Non-boss instant run-ender. CHAOS and ANTE modes never emit this.
 * Pacing is implicit per `killerId`:
 *  - 'spontaneous_combustion' — no-warning ~1.5s sprite-shatter pop.
 *  - 'banana_peel' — ~1.5s comedic slip.
 */
type BookEventAmbushDeath = {
	index: number;
	type: 'ambushDeath';
	killerId: AmbushKillerId;
};

/** Result reveal. `payoutMultiplier` drives the overlay number. */
type BookEventRoundEnd = {
	index: number;
	type: 'roundEnd';
	payoutMultiplier: number;
	result: RoundResult;
};

export type BookEvent =
	| BookEventRoundInit
	| BookEventQuietBeat
	| BookEventSpeedChange
	| BookEventFodderWave
	| BookEventBigEnemyKill
	| BookEventSpellAttack
	| BookEventPotion
	| BookEventPowerdown
	| BookEventFlyingDragon
	| BookEventChest
	| BookEventLightning
	| BookEventMiniBossFight
	| BookEventFinalBossFight
	| BookEventAmbushDeath
	| BookEventRoundEnd;

export type Bet = BetType<BookEvent>;
export type BookEventOfType<T> = Extract<BookEvent, { type: T }>;
export type BookEventContext = { bookEvents: BookEvent[] };
