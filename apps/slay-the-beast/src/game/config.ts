// Slay the Beast — bet mode config. Shape mirrors web-sdk/apps/price/src/game/config.ts.
// These cost + flag values are sent verbatim to RGS as `mode: <key>`.

export default {
	providerName: 'stake_originals',
	gameName: 'slay_the_beast',
	gameID: 'slay_the_beast',
	rtp: 0.96,
	betModes: {
		base: {
			cost: 1.0,
			feature: true,
			buyBonus: false,
			rtp: 0.96,
			max_win: 5000,
		},
		ante: {
			cost: 5.0,
			feature: true,
			buyBonus: true,
			rtp: 0.96,
			max_win: 5000,
		},
		chaos: {
			cost: 100.0,
			feature: true,
			buyBonus: true,
			rtp: 0.96,
			max_win: 5000,
		},
	},
};
