// Event emitter broadcast types — handlers fire these, scene components subscribe.
// Stream 1 wires the bare minimum needed to prove the dispatcher round-trips.
// Stream 2 will extend with per-variant render events.

export type EmitterEventGame =
	| { type: 'roundStart' }
	| { type: 'roundEndShow'; payoutMultiplier: number; result: 'win' | 'loss' }
	| { type: 'roundEndHide' }
	| { type: 'scoreUpdate'; cumulative: number };
