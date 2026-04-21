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

export type RoundResult = 'win' | 'loss';

export type AmbushReason = 'trap' | 'ambush';

export const BET_MODES = ['base'] as const;
export type BetMode = (typeof BET_MODES)[number];

export const STARTING_HEARTS = 3;
