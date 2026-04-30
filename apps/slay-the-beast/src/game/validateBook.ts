import type { BookEvent } from './typesBookEvent';
import type { BetMode } from './types';

// ---------------------------------------------------------------------------
// Runtime invariant check for mock books (and, eventually, real RGS books).
// Encodes the bet-mode rules that live only in prose comments today, plus
// structural shape rules. Throws on the first violation with a descriptive
// message — call sites are expected to crash fast in dev rather than ship a
// broken book to the renderer.
//
// 2026-04-30: redesigned to the "death banks score" model. ambushDeath and
// finalBossFight(passed) no longer force payoutMultiplier=0 — they bank the
// cumulative score earned up to that point. result is now purely a function
// of payoutMultiplier (>0 → 'win', =0 → 'loss'). Chaos no longer required
// to reach finalBossFight; just elevated probability in math-sdk.
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

	// Bet-mode invariants. Ante's value prop is "guaranteed full-length round"
	// (paid 5× for it); ambush still forbidden. Chaos value prop is "huge wins
	// available" (paid 100×); ambush still forbidden but final-reach is no
	// longer required to be 100% — math-sdk just biases toward it.
	const hasAmbush = events.some((e) => e.type === 'ambushDeath');
	if ((mode === 'ante' || mode === 'chaos') && hasAmbush) {
		throw new Error(`${tag}: mode=${mode} forbids ambushDeath`);
	}

	// Chest multipliers must be positive finite.
	for (const e of events) {
		if (e.type === 'chest' && (!Number.isFinite(e.multiplier) || e.multiplier <= 0)) {
			throw new Error(`${tag}: chest.multiplier must be > 0 finite (got ${e.multiplier})`);
		}
	}

	// roundEnd coherence under the banked-score model:
	// payoutMultiplier === 0  →  result must be 'loss'
	// payoutMultiplier  >  0  →  result must be 'win'
	// Either case is valid regardless of whether ambushDeath / finalBossFight
	// 'passed' / mini-boss 'passed' is present — those events bank the score
	// rather than forfeit it.
	if (!Number.isFinite(last.payoutMultiplier) || last.payoutMultiplier < 0) {
		throw new Error(`${tag}: roundEnd.payoutMultiplier=${last.payoutMultiplier} must be >= 0 finite`);
	}
	if (last.payoutMultiplier === 0 && last.result !== 'loss') {
		throw new Error(`${tag}: payoutMultiplier=0 but result='${last.result}' (must be 'loss')`);
	}
	if (last.payoutMultiplier > 0 && last.result !== 'win') {
		throw new Error(`${tag}: payoutMultiplier=${last.payoutMultiplier} > 0 but result='${last.result}' (must be 'win')`);
	}

	// Top-level payoutMultiplier must equal the roundEnd's.
	if (payoutMultiplier !== last.payoutMultiplier) {
		throw new Error(
			`${tag}: top-level payoutMultiplier=${payoutMultiplier} disagrees with roundEnd.payoutMultiplier=${last.payoutMultiplier}`,
		);
	}

	// Erosion-window invariant. The renderer detects the "post-mini-kill score
	// erosion" path by watching for a powerdown/lightning(penalty)/flyingDragon
	// event that immediately follows a miniBossFight(killed). For that
	// heuristic to be safe, the only legal events directly after a kept
	// mini-boss kill are: roundEnd (no erosion), finalBossFight (the mini was
	// just a setup beat), or exactly one erosion event followed by roundEnd.
	// Any other shape would mis-fire the wounded-flinch beat.
	for (let i = 0; i < events.length; i++) {
		const e = events[i];
		if (e.type !== 'miniBossFight' || e.outcome !== 'killed') continue;
		const next = events[i + 1];
		if (!next) continue;
		if (next.type === 'roundEnd' || next.type === 'finalBossFight') continue;
		const isErosion =
			next.type === 'powerdown' ||
			(next.type === 'lightning' && next.outcome === 'penalty') ||
			(next.type === 'flyingDragon' && next.hit === true);
		if (!isErosion) {
			throw new Error(
				`${tag}: event after miniBossFight(killed) must be roundEnd | finalBossFight | erosion ` +
					`(powerdown / lightning(penalty) / flyingDragon(hit)); got ${next.type}`,
			);
		}
		const after = events[i + 2];
		if (!after || after.type !== 'roundEnd') {
			throw new Error(
				`${tag}: erosion event after miniBossFight(killed) must be immediately followed by roundEnd; ` +
					`got ${after?.type ?? '<missing>'}`,
			);
		}
	}
};
