import type { BetMode, HeroId, BiomeId, RoundResult } from './types';

// Per-round game state. Owned by the Svelte 5 runes runtime.
// Handlers in bookEventHandlerMap.ts mutate this; Game.svelte derives UI from it.
export const stateGame = $state({
	// Round-level
	heroId: 'male_warrior' as HeroId,
	biomeId: 'grasslands' as BiomeId,
	mode: 'base' as BetMode,
	isPlaying: false,
	cumulativeScore: 0,
	// Result (set by roundEnd)
	lastResult: null as RoundResult | null,
	lastPayout: 0,
});

export type StateGame = typeof stateGame;
