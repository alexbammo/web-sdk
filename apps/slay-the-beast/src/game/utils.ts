import { createPlayBookUtils } from 'utils-book';
import { stateBet } from 'state-shared';

import { eventEmitter } from './eventEmitter';
import { bookEventHandlerMap } from './bookEventHandlerMap';
import { validateBook } from './validateBook';
import type { Bet } from './typesBookEvent';
import type { MockBook } from './mockBook';

export const { playBookEvent, playBookEvents } = createPlayBookUtils({ bookEventHandlerMap });

// Phase C entry-point — call from the SPIN button (or RGS hookup later).
// Validates the book, then iterates events through the dispatcher.
// Runtime cost is tiny vs. the animation timings the handlers await.
export const playBook = async (book: MockBook | Bet) => {
	const events = 'events' in book ? book.events : book.state;
	validateBook({
		id: 'id' in book ? book.id : undefined,
		events,
		payoutMultiplier:
			'payoutMultiplier' in book ? book.payoutMultiplier : (book as Bet).payoutMultiplier,
	});
	await playBookEvents(events);
};

/**
 * Play a bet returned by the RGS. Distinct from playBook(), which takes a local
 * book — this is the path a real spin travels.
 */
export const playBet = async (bet: Bet) => {
	stateBet.winBookEventAmount = 0;
	await playBookEvents(bet.state);
	eventEmitter.broadcast({ type: 'stopButtonEnable' });
};
