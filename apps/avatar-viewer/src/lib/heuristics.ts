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
	// Listed first so it wins ties, and last-resort default below.
	{
		words: [
			'finance',
			'banking',
			'ceo',
			'partner',
			'director',
			'executive',
			'consult',
			'account',
			'recruit',
			'operations',
			'hr',
		],
		scene: 'office',
		time: 'morning',
		accent: '#2f4a6b',
		warmth: 0.4,
		props: ['notebook', 'coffee'],
		caption: 'Morning light before the first meeting',
	},
	{
		words: [
			'engineer',
			'developer',
			'software',
			'data',
			'product',
			'marketing',
			'analyst',
			'manager',
			'startup',
		],
		scene: 'cafe',
		time: 'morning',
		accent: '#3f6e8c',
		warmth: 0.5,
		props: ['laptop', 'coffee'],
		caption: 'A flat white before stand-up',
	},
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
		time: 'morning',
		accent: '#d9643a',
		warmth: 0.45,
		props: ['sketchbook', 'coffee'],
		caption: 'Ideas taking shape in a sunlit studio',
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
		time: 'golden',
		accent: '#7a2f2f',
		warmth: 0.6,
		props: ['books', 'tea'],
		caption: 'Late afternoon among the stacks',
	},
	{
		words: ['investor', 'venture', 'vc', 'founder', 'sales'],
		scene: 'rooftop',
		time: 'dusk',
		accent: '#c9a54c',
		warmth: 0.55,
		props: ['notebook'],
		caption: 'The city at the end of a big day',
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
			'food',
			'chef',
			'garden',
		],
		scene: 'veranda',
		time: 'golden',
		accent: '#6f8f5a',
		warmth: 0.6,
		props: ['flowers', 'tea'],
		caption: 'Golden hour on the veranda',
	},
];

export function heuristicDirection(input: ProfileInput): SceneDirection {
	const text = [input.headline, input.about, input.extra].filter(Boolean).join(' ').toLowerCase();
	let best: Rule = RULES[0]; // office
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
		// Without Claude we can't see the photo; let the image model continue what they wear.
		outfit: '',
		caption: best.caption,
		reasoning:
			bestScore > 0
				? `Keyword match on the profile text (${bestScore} hit${bestScore === 1 ? '' : 's'}). Add an Anthropic API key for a proper read of the photo and profile.`
				: 'No strong signals in the text, so this is the default office. Add an Anthropic API key for a proper read of the photo and profile.',
		source: 'heuristic',
	};
}
