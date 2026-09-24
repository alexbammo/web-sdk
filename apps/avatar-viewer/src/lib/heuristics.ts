import type { ProfileInput, PropId, SceneDirection, SceneId, TimeOfDay } from './types.js';

// Keyword fallback used when no Claude key is configured. Deliberately simple:
// it only needs to produce a plausible starting point the user can override.

interface Rule {
	words: string[];
	scene: SceneId;
	time: TimeOfDay;
	accent: string;
	warmth: number;
	props: PropId[];
	caption: string;
}

const RULES: Rule[] = [
	{
		words: [
			'design',
			'designer',
			'creative',
			'artist',
			'brand',
			'ux',
			'ui',
			'illustrat',
			'architect',
			'photograph',
		],
		scene: 'loft',
		time: 'midday',
		accent: '#d9643a',
		warmth: 0.45,
		props: ['sketchbook', 'coffee', 'plants'],
		caption: 'Sketching ideas in a sunlit studio loft',
	},
	{
		words: [
			'research',
			'professor',
			'phd',
			'academic',
			'author',
			'writer',
			'editor',
			'law',
			'lawyer',
			'historian',
			'teacher',
		],
		scene: 'library',
		time: 'dusk',
		accent: '#7a2f2f',
		warmth: 0.75,
		props: ['books', 'tea', 'notebook'],
		caption: 'An evening among the stacks',
	},
	{
		words: [
			'finance',
			'investor',
			'venture',
			'vc',
			'banking',
			'founder',
			'ceo',
			'partner',
			'sales',
			'director',
			'executive',
		],
		scene: 'rooftop',
		time: 'night',
		accent: '#c9a54c',
		warmth: 0.6,
		props: ['wine', 'plants'],
		caption: 'City lights after closing the round',
	},
	{
		words: [
			'wellness',
			'coach',
			'yoga',
			'nutrition',
			'sustainab',
			'hospitality',
			'travel',
			'wine',
			'food',
			'chef',
			'garden',
		],
		scene: 'veranda',
		time: 'golden',
		accent: '#6f8f5a',
		warmth: 0.8,
		props: ['flowers', 'tea', 'plants'],
		caption: 'Golden hour on the veranda',
	},
	{
		words: [
			'engineer',
			'developer',
			'software',
			'data',
			'product',
			'marketing',
			'consult',
			'analyst',
			'manager',
			'startup',
		],
		scene: 'cafe',
		time: 'morning',
		accent: '#3f6e8c',
		warmth: 0.55,
		props: ['laptop', 'coffee', 'plants'],
		caption: 'Morning flat white before stand-up',
	},
];

export function heuristicDirection(input: ProfileInput): SceneDirection {
	const text = [input.headline, input.about, input.extra].filter(Boolean).join(' ').toLowerCase();
	let best: Rule = RULES[RULES.length - 1];
	let bestScore = 0;
	for (const rule of RULES) {
		// match at word starts so "ui" doesn't hit "build" or "law" hit "flaw"
		const score = rule.words.reduce((n, w) => n + (new RegExp(`\\b${w}`).test(text) ? 1 : 0), 0);
		if (score > bestScore) {
			best = rule;
			bestScore = score;
		}
	}
	return {
		scene: best.scene,
		timeOfDay: best.time,
		accentColor: best.accent,
		warmth: best.warmth,
		props: best.props,
		caption: best.caption,
		reasoning:
			bestScore > 0
				? `Keyword match on the profile text (${bestScore} hit${bestScore === 1 ? '' : 's'}). Add an Anthropic API key for a proper read of the photo and profile.`
				: 'No strong signals in the text, so this is the default café. Add an Anthropic API key for a proper read of the photo and profile.',
		source: 'heuristic',
	};
}
