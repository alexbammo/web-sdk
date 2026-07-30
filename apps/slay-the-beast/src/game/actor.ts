import { stateBet } from 'state-shared';
import { createPrimaryMachines, createIntermediateMachines, createGameActor } from 'utils-xstate';

import type { Bet } from './typesBookEvent';
import { playBet } from './utils';

/**
 * Bet lifecycle actor.
 *
 * This is what makes the game an actual RGS client rather than a local demo.
 * Until now `bookSource.ts` picked from a bundled 50-book smoke library with
 * Math.random(), which fails the reviewer checklist at item one ("game
 * authenticates with RGS on launch") and item two ("clicking bet sends a
 * successful play request") — before anyone forms an opinion about the game.
 *
 * The SDK owns the whole state machine (authenticate -> play -> render ->
 * end-round, plus resume-on-refresh and autoplay); we only supply the callbacks
 * that are specific to this game.
 *
 * Most callbacks are no-ops here because Slay the Beast has no reel board to
 * pre-spin or settle — the scene is a continuous run driven by the book's
 * event list. That asymmetry with the reel-based sample games is expected.
 */
const primaryMachines = createPrimaryMachines<Bet>({
	// A round interrupted by a refresh resumes from its book. There is no
	// board state to reconstruct — the scene simply replays the events.
	onResumeGameActive: (betToResume) => betToResume,
	onResumeGameInactive: () => {},

	onNewGameStart: async () => {
		stateBet.winBookEventAmount = 0;
	},
	onNewGameError: () => {},

	onPlayGame: async (bet) => await playBet(bet),

	// Treat reaching the final boss as the bonus-game beat. It is the round's
	// marquee moment and the closest analogue to a reel game's free-spin entry.
	checkIsBonusGame: (bet) =>
		Array.isArray(bet.state) && bet.state.some((e) => e?.type === 'finalBossFight'),
});

const intermediateMachines = createIntermediateMachines(primaryMachines);

export const gameActor = createGameActor(intermediateMachines);
