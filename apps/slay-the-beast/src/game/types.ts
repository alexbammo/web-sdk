// Characters

export const HERO_IDS = [
	'male_warrior',
	'male_knight',
	'male_archer',
	'male_thief',
	'male_wizard',
] as const;
export type HeroId = (typeof HERO_IDS)[number];

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

export const BIG_ENEMY_IDS = ['dragon', 'cyclops', 'demon', 'bear'] as const;
export type BigEnemyId = (typeof BIG_ENEMY_IDS)[number];

export const BOSS_IDS = [
	'behemoth',
	'boss_dragon',
	'dark_lord',
	'demon',
	'evil_king',
] as const;
export type BossId = (typeof BOSS_IDS)[number];

// Arenas / biomes — v1 ships one or two, rendered as background swaps.

export const BIOME_IDS = ['grasslands', 'wasteland'] as const;
export type BiomeId = (typeof BIOME_IDS)[number];

// Pickups — floating items the hero may or may not acquire.
// Effect shapes:
//   timed      → effect lasts durationMs, self-clearing
//   persistent → effect lasts until broken by retaliation / terrainHazard(died) / ambushDeath
//   instant    → effect applies immediately (coin, shrine), no lingering state

export const ITEM_IDS = [
	'fire_sword',
	'plate_armour',
	'giant_potion',
	'lucky_ring',
	'magic_rune',
	'battle_banner',
	'shrine_blessing',
	'gold_coin',
] as const;
export type ItemId = (typeof ITEM_IDS)[number];

export const PICKUP_EFFECT_TYPES = ['timed', 'persistent', 'instant'] as const;
export type PickupEffectType = (typeof PICKUP_EFFECT_TYPES)[number];

// Sky ride mounts — timed cinematic boost; rides themselves inline in base mode.

export const MOUNT_IDS = [
	'unicorn',
	'rainbow_dragon',
	'phoenix',
	'griffin',
	'pegasus',
	'magic_carpet',
	'giant_eagle',
	'tornado',
	'cloud_whale',
] as const;
export type MountId = (typeof MOUNT_IDS)[number];

// Allies — summoned helpers that affect kill pace or absorb hits.

export const ALLY_IDS = ['wolf', 'ogre', 'bard'] as const;
export type AllyId = (typeof ALLY_IDS)[number];

// Slowers — multiplier-draining / pacing-loss hazards (no heart loss).

export const SLOWER_KINDS = [
	'storm_cloud',
	'swamp',
	'tar_pit',
	'leech_swarm',
	'cursed_mist',
	'ghost_drain',
	'gold_thief_goblin',
	'mimic_chest',
	'rust_cloud',
] as const;
export type SlowerKind = (typeof SLOWER_KINDS)[number];

// Terrain hazards — pre-decided jump-or-fall moments. `outcome: 'cleared' | 'died'`.

export const HAZARD_IDS = [
	'tentacle_pit',
	'cliff_edge',
	'lava_gap',
	'spike_trap',
	'chasm',
	'cannon',
] as const;
export type HazardId = (typeof HAZARD_IDS)[number];

export type HazardOutcome = 'cleared' | 'died';

// Spells — cosmetic flavour for spellAttack variant.

export const SPELL_KINDS = ['fire', 'ice', 'lightning', 'arcane'] as const;
export type SpellKind = (typeof SPELL_KINDS)[number];

// Ambush death flavours — which way the run ends.

export const AMBUSH_KILLER_IDS = [
	'frog',
	'giant_foot',
	'meteor',
	'shark',
	'gelatinous_cube',
	'banana_peel',
	'dragon_swoop',
	'medusa',
	'vampire',
	'skeletal_hand',
	'self_spell',
] as const;
export type AmbushKillerId = (typeof AMBUSH_KILLER_IDS)[number];

// 'quick' = short cinematic (~1.5s). 'dramatic' = long cinematic (~4s).
export type AmbushStyle = 'quick' | 'dramatic';

// Round outcome / bet mode.

export type RoundResult = 'win' | 'loss';

export const BET_MODES = ['base'] as const;
export type BetMode = (typeof BET_MODES)[number];

export const STARTING_HEARTS = 3;
