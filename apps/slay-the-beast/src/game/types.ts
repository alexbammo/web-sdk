// Heroes

export const HERO_IDS = [
	'male_warrior',
	'male_knight',
	'male_thief',
	'male_wizard',
] as const;
export type HeroId = (typeof HERO_IDS)[number];

// Fodder enemies — the dozens-per-wave trash the hero cuts through.

export const FODDER_SPRITE_IDS = [
	'monster_01',
	'monster_02',
	'monster_03',
	'monster_04',
	'monster_05',
	'monster_06',
	'monster_07',
	'monster_08',
] as const;
export type FodderSpriteId = (typeof FODDER_SPRITE_IDS)[number];

// Mid-tier "big kill" enemies.

export const BIG_ENEMY_IDS = ['dragon', 'cyclops', 'demon', 'bear'] as const;
export type BigEnemyId = (typeof BIG_ENEMY_IDS)[number];

// Boss sprites — mini and final share the pool.

export const BOSS_IDS = [
	'behemoth',
	'boss_dragon',
	'dark_lord',
	'demon',
	'evil_king',
] as const;
export type BossId = (typeof BOSS_IDS)[number];

// Biomes / arenas — background swap only.

export const BIOME_IDS = ['grasslands', 'wasteland'] as const;
export type BiomeId = (typeof BIOME_IDS)[number];

// Cosmetic spell flavours — decides particle kit only.

export const SPELL_KINDS = ['fire', 'ice', 'lightning', 'arcane'] as const;
export type SpellKind = (typeof SPELL_KINDS)[number];

// Pacing — scroll speed tier for a `speedChange` beat.

export const SPEED_TIERS = ['stroll', 'run', 'sprint'] as const;
export type SpeedTier = (typeof SPEED_TIERS)[number];

// Fodder-wave density. `trickle` = few enemies over a long window, `horde` = many close together.

export const WAVE_SIZES = ['trickle', 'horde'] as const;
export type WaveSize = (typeof WAVE_SIZES)[number];

// Powerdown flavours — the three ways the hero loses score without dying.

export const POWERDOWN_FLAVOURS = ['trap', 'thief', 'curse'] as const;
export type PowerdownFlavour = (typeof POWERDOWN_FLAVOURS)[number];

// Flying-dragon attacks — 'fireball' splash, 'poop' is the tongue-in-cheek cursed variant.

export const DRAGON_ATTACK_TYPES = ['fireball', 'poop'] as const;
export type DragonAttackType = (typeof DRAGON_ATTACK_TYPES)[number];

// Lightning resolves to a penalty 95% of the time and a LIGHTNING MODE buff 5% of the time.

export const LIGHTNING_OUTCOMES = ['penalty', 'lightning_mode'] as const;
export type LightningOutcome = (typeof LIGHTNING_OUTCOMES)[number];

// Ambush flavours — instant run-enders that aren't a boss encounter.
// v1 ships with two: a no-warning sprite-shatter pop, and the comedic banana
// slip. Pacing is implicit per flavour; there is no separate style axis.
export const AMBUSH_KILLER_IDS = ['spontaneous_combustion', 'banana_peel'] as const;
export type AmbushKillerId = (typeof AMBUSH_KILLER_IDS)[number];

// Round outcome.

export type RoundResult = 'win' | 'loss';

// Bet modes — base / ante / chaos.
// `ante` is the 5× stake that removes instant-death events ("guarantee").
// `chaos` is the 100× stake that also paints a power glow on the hero and
// guarantees final-zone reach.

export const BET_MODES = ['base', 'ante', 'chaos'] as const;
export type BetMode = (typeof BET_MODES)[number];
