/**
 * Rules, paytable and legal content.
 *
 * Kept as data rather than markup so it can be rendered by the rules modal, the
 * info modal and Storybook without duplication, and so the i18n sweep has a
 * single place to extract from. Every string here is player-visible and will
 * need an `en` catalogue key plus a `__SOCIAL` twin (the social-casino ruleset
 * blocks currency words and symbols in player-visible text).
 *
 * Approval requires the rules to communicate, per mode: cost, RTP, max win, how
 * payouts are earned, and how feature modes are entered. It also requires a
 * disclaimer covering seven specific points; a submission without one is not
 * approved. Those seven are enumerated in DISCLAIMER below and each is tagged
 * with the point it satisfies so none can be dropped in an edit.
 */

import { MODE_COST, type BetMode } from './types';

/** Figures come from the shipped library's own lookup table, not the simulator. */
export const MODE_STATS: Record<BetMode, { rtp: string; maxWin: string; hitRate: string }> = {
	base: { rtp: '96.14%', maxWin: '5,000×', hitRate: '1 in 4.2' },
	ante: { rtp: '95.86%', maxWin: '5,000×', hitRate: '1 in 4.1' },
	chaos: { rtp: '95.83%', maxWin: '5,000×', hitRate: '1 in 3.4' },
};

export const MODE_DESCRIPTION: Record<BetMode, string> = {
	base: 'The full run. An ambush can end it at any step — but whatever you have collected is still paid.',
	ante: 'No ambushes. Longer runs and a deeper reach into the beast’s territory.',
	chaos: 'The storm never lifts. The deepest runs and the highest ceiling in the game.',
};

/** Ordered sections of the RULES tab. */
export const RULES_SECTIONS: Array<{ heading: string; body: string[] }> = [
	{
		heading: 'How this game works',
		body: [
			'Every result is decided the moment you press SPIN. There is no skill, no timing and no input during a run — what you watch is the outcome being shown to you, not decided.',
			'Your hero travels through hostile ground collecting GOLD. The run ends when the hero falls, when a boss stops them, or when the ground runs out.',
		],
	},
	{
		heading: 'GOLD and your win',
		body: [
			'GOLD is the score your hero collects during a run. It is shown at a large display scale so it reads clearly on screen.',
			'Your actual win is presented as a multiplier of your bet at the end of every run. The multiplier and the cash figure shown at the end of the run are the real payout.',
		],
	},
	{
		heading: 'If your hero falls',
		body: [
			'A run that ends in death is not automatically a loss. Whatever GOLD was collected up to that moment is banked and paid.',
			'A run pays only if it banks at least the value of your stake. Below that, the run pays nothing — this game never pays back less than you staked.',
		],
	},
	{
		heading: 'Chests',
		body: [
			'A chest multiplies the GOLD collected so far by the number shown on it. The number on the banner is exactly the number applied.',
		],
	},
	{
		heading: 'Bosses',
		body: [
			'A mini-boss may appear partway through a run. Defeating it continues the run; being stopped by it ends the run with your GOLD banked.',
			'The final boss is the largest single payout in the game and is reached rarely.',
		],
	},
];

/** What each event contributes. Rendered as the PAYTABLE tab. */
export const PAYTABLE_ROWS: Array<{ name: string; effect: string }> = [
	{ name: 'Fodder wave', effect: 'Adds GOLD for each enemy defeated.' },
	{ name: 'Big enemy', effect: 'Adds a larger single amount of GOLD.' },
	{ name: 'Potion', effect: 'Doubles the GOLD from each kill for a short time.' },
	{ name: 'Chest', effect: 'Multiplies GOLD collected so far by the number shown.' },
	{ name: 'Lightning', effect: 'Usually costs GOLD. Rarely triggers a burst that earns it.' },
	{ name: 'Trap, thief or curse', effect: 'Removes some of the GOLD collected.' },
	{ name: 'Flying dragon', effect: 'May strike the hero and remove GOLD, or may miss.' },
	{ name: 'Mini-boss', effect: 'Defeated adds GOLD and continues the run; otherwise the run ends.' },
	{ name: 'Final boss', effect: 'Defeated pays the largest amount in the game.' },
	{ name: 'Ambush', effect: 'Ends the run without warning. GOLD collected so far is still banked.' },
];

/**
 * The seven required disclaimer points. Do not remove an entry — each is tagged
 * with the requirement it satisfies.
 */
export const DISCLAIMER: Array<{ point: string; text: string }> = [
	{
		point: 'malfunction',
		text: 'Malfunction voids all pays and plays.',
	},
	{
		point: 'connection',
		text: 'A stable internet connection is required. An interrupted connection may prevent a round from being displayed correctly.',
	},
	{
		point: 'disconnection',
		text: 'If you are disconnected during a round, the round is completed by the game server. Reopening the game will show the completed result and any winnings are credited to your balance.',
	},
	{
		point: 'expected-return',
		text: 'The theoretical return to player is 96.14% in BASE, 95.86% in ANTE and 95.83% in CHAOS, measured over 200,000 simulated rounds per mode. Actual returns over any individual session will vary.',
	},
	{
		point: 'display-accuracy',
		text: 'Figures shown on screen are rounded for display. Settlement uses the exact values held by the game server.',
	},
	{
		point: 'payout-source',
		text: 'Winnings are settled according to the amount received from the Remote Game Server and not from events within the web browser.',
	},
	{
		point: 'copyright',
		text: 'All game content, artwork, audio and code are protected by copyright and may not be reproduced without permission.',
	},
];

/** Per-mode summary rows for the MODES tab. */
export const modeRows = (): Array<{
	mode: BetMode;
	cost: string;
	rtp: string;
	maxWin: string;
	hitRate: string;
	description: string;
}> =>
	(Object.keys(MODE_COST) as BetMode[]).map((mode) => ({
		mode,
		cost: `${MODE_COST[mode]}× bet`,
		rtp: MODE_STATS[mode].rtp,
		maxWin: MODE_STATS[mode].maxWin,
		hitRate: MODE_STATS[mode].hitRate,
		description: MODE_DESCRIPTION[mode],
	}));
