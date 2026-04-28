import type { BookEvent } from './typesBookEvent';
import type { BetMode } from './types';
import { validateBook } from './validateBook';

import baseRaw from './library/base.jsonl?raw';
import anteRaw from './library/ante.jsonl?raw';
import chaosRaw from './library/chaos.jsonl?raw';

// ---------------------------------------------------------------------------
// Real-book source for Phase 2. Replaces the seven hand-rolled scenarios in
// mockBook.ts. Each .jsonl bundle is the 50-book smoke sample committed by
// the math-sdk under games/slay_the_beast/library/smoke/<mode>_sample.jsonl,
// regenerated whenever the simulator is re-tuned. Vite imports the files as
// raw text via ?raw; we parse + validate every book at module load so any
// contract drift between the math-sdk and the frontend crashes here, not
// half-way through a render.
// ---------------------------------------------------------------------------

export type LibraryBook = {
	id: number;
	events: BookEvent[];
	payoutMultiplier: number;
};

const parseLibrary = (raw: string, mode: BetMode): LibraryBook[] => {
	const books: LibraryBook[] = [];
	const lines = raw.split('\n');
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line) continue;
		const book = JSON.parse(line) as LibraryBook;
		validateBook(book);
		const init = book.events[0];
		if (init.type !== 'roundInit' || init.mode !== mode) {
			throw new Error(
				`bookSource: ${mode} library line ${i + 1} reports roundInit.mode=${
					init.type === 'roundInit' ? init.mode : '<missing>'
				}`,
			);
		}
		books.push(book);
	}
	if (books.length === 0) throw new Error(`bookSource: ${mode} library is empty`);
	return books;
};

const LIBRARY: Record<BetMode, LibraryBook[]> = {
	base: parseLibrary(baseRaw, 'base'),
	ante: parseLibrary(anteRaw, 'ante'),
	chaos: parseLibrary(chaosRaw, 'chaos'),
};

export const pickBook = (mode: BetMode): LibraryBook => {
	const books = LIBRARY[mode];
	return books[Math.floor(Math.random() * books.length)];
};

export const libraryStats = (): Record<BetMode, { count: number; meanRtp: number }> => {
	const stats = {} as Record<BetMode, { count: number; meanRtp: number }>;
	for (const mode of ['base', 'ante', 'chaos'] as const) {
		const books = LIBRARY[mode];
		const sum = books.reduce((acc, b) => acc + b.payoutMultiplier, 0);
		const cost = mode === 'base' ? 1 : mode === 'ante' ? 5 : 100;
		stats[mode] = { count: books.length, meanRtp: sum / (books.length * cost) };
	}
	return stats;
};
