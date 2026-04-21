import type { BookEventHandlerMap } from 'utils-book';

import type { BookEvent, BookEventContext } from './typesBookEvent';

export const bookEventHandlerMap: BookEventHandlerMap<BookEvent, BookEventContext> = {
	roundInit: async () => {},
	fodderWave: async () => {},
	bigEnemyKill: async () => {},
	spellAttack: async () => {},
	retaliation: async () => {},
	slower: async () => {},
	pickup: async () => {},
	skyRide: async () => {},
	ally: async () => {},
	terrainHazard: async () => {},
	bossEncounter: async () => {},
	bossKill: async () => {},
	ambushDeath: async () => {},
	roundEnd: async () => {},
};
