import { HERO_IDS, BIG_ENEMY_IDS, BOSS_IDS } from './types';

// Phase C — Stream 2 asset paths. Heroes / fodder / big enemies are 4×16
// sprite-sheets at 512px per frame (see scene/spriteFrames.ts for the row
// layout). Bosses are single still-frame PNGs at "_7_4x" scale.
//
// Scene.svelte preloads everything here on mount via PIXI.Assets.load and
// caches the resulting textures. Total raw weight ~25MB — acceptable for v1
// demo, revisit packing in polish.

const FODDER_SUBSET = ['monster_01', 'monster_02', 'monster_03', 'monster_04'] as const;

export type SpriteKey = string;

export const SPRITE_PATHS: Record<SpriteKey, string> = {
	...Object.fromEntries(HERO_IDS.map((id) => [`hero/${id}`, `/assets/heroes/${id}.png`])),
	...Object.fromEntries(
		FODDER_SUBSET.map((id) => [`fodder/${id}`, `/assets/enemies/fodder/${id}.png`]),
	),
	...Object.fromEntries(BIG_ENEMY_IDS.map((id) => [`big/${id}`, `/assets/enemies/big/${id}.png`])),
	...Object.fromEntries(
		BOSS_IDS.map((id) => [`boss/${id}`, `/assets/enemies/boss/${id}_7_4x.png`]),
	),
};

export { FODDER_SUBSET };

// stateApp expects an `Assets` map keyed by name with { type, src }. We don't
// actually use pixi-svelte's <Sprite key="..."> path (Scene loads PIXI.Assets
// directly and renders via <BaseSprite>), but stateApp asks for one at boot.
export default Object.fromEntries(
	Object.entries(SPRITE_PATHS).map(([key, src]) => [key, { type: 'sprite' as const, src }]),
);
