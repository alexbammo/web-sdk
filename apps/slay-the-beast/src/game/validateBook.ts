import type { BookEvent } from './typesBookEvent';
import type { BetMode } from './types';

// ---------------------------------------------------------------------------
// Runtime invariant check for mock books (and, eventually, real RGS books).
// Encodes the bet-mode rules that live only in prose comments today, plus
// structural shape rules. Throws on the first violation with a descriptive
// message — call sites are expected to crash fast in dev rather than ship a
// broken book to the renderer.
// ---------------------------------------------------------------------------

export type BookForValidation = {
	id?: number;
	events: BookEvent[];
	payoutMultiplier: number;
};

export const validateBook = (book: BookForValidation): void => {
	const { events, payoutMultiplier } = book;
	const tag = book.id !== undefined ? `book #${book.id}` : 'book';

	if (events.length === 0) throw new Error(`${tag}: events is empty`);

	// Indices must be sequential 0..n-1.
	events.forEach((e, i) => {
		if (e.index !== i) throw new Error(`${tag}: event[${i}].index === ${e.index}, expected ${i}`);
	});

	// First event must be roundInit; last must be roundEnd.
	const first = events[0];
	const last = events[events.length - 1];
	if (first.type !== 'roundInit') throw new Error(`${tag}: events[0] is ${first.type}, expected roundInit`);
	if (last.type !== 'roundEnd') throw new Error(`${tag}: last event is ${last.type}, expected roundEnd`);

	const mode: BetMode = first.mode;

	// Bet-mode invariants.
	const hasAmbush = events.some((e) => e.type === 'ambushDeath');
	const finalBosses = events.filter((e) => e.type === 'finalBossFight');
	const finalPassed = finalBosses.some((e) => e.outcome === 'passed');

	if (mode === 'ante' || mode === 'chaos') {
		if (hasAmbush) throw new Error(`${tag}: mode=${mode} forbids ambushDeath`);
		if (finalPassed) throw new Error(`${tag}: mode=${mode} forbids finalBossFight.outcome='passed'`);
	}
	if (mode === 'chaos' && finalBosses.length === 0) {
		throw new Error(`${tag}: mode=chaos must reach finalBossFight (none present)`);
	}

	// Chest multipliers must be positive finite.
	for (const e of events) {
		if (e.type === 'chest' && (!Number.isFinite(e.multiplier) || e.multiplier <= 0)) {
			throw new Error(`${tag}: chest.multiplier must be > 0 finite (got ${e.multiplier})`);
		}
	}

	// roundEnd coherence: a loss must be triggered by a recognised round-ender
	// (ambushDeath or finalBossFight 'passed') and must payout 0; a win must
	// payout > 0.
	if (last.result === 'loss') {
		if (!hasAmbush && !finalPassed) {
			throw new Error(`${tag}: result='loss' but no ambushDeath or finalBossFight 'passed' present`);
		}
		if (last.payoutMultiplier !== 0) {
			throw new Error(`${tag}: result='loss' but payoutMultiplier=${last.payoutMultiplier} (must be 0)`);
		}
	} else {
		// 'win'
		if (hasAmbush) throw new Error(`${tag}: result='win' but events contain ambushDeath`);
		if (finalPassed) throw new Error(`${tag}: result='win' but finalBossFight.outcome='passed'`);
		if (last.payoutMultiplier <= 0) {
			throw new Error(`${tag}: result='win' but payoutMultiplier=${last.payoutMultiplier} (must be > 0)`);
		}
	}

	// Top-level payoutMultiplier must equal the roundEnd's.
	if (payoutMultiplier !== last.payoutMultiplier) {
		throw new Error(
			`${tag}: top-level payoutMultiplier=${payoutMultiplier} disagrees with roundEnd.payoutMultiplier=${last.payoutMultiplier}`,
		);
	}
};
