import type { BookEventHandlerMap } from 'utils-book';

import type { BookEvent, BookEventContext } from './typesBookEvent';

export const bookEventHandlerMap: BookEventHandlerMap<BookEvent, BookEventContext> = {
	roundInit: async () => {},
	fodderWave: async () => {},
	bigEnemyKill: async () => {},
	retaliation: async () => {},
	spellAttack: async () => {},
	bossEncounter: async () => {},
	bossKill: async () => {},
	ambushDeath: async () => {},
	roundEnd: async () => {},
};
