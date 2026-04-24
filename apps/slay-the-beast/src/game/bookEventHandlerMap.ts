import type { BookEventHandlerMap } from 'utils-book';

import type { BookEvent, BookEventContext } from './typesBookEvent';

export const bookEventHandlerMap: BookEventHandlerMap<BookEvent, BookEventContext> = {
	roundInit: async () => {},
	quietBeat: async () => {},
	speedChange: async () => {},
	fodderWave: async () => {},
	bigEnemyKill: async () => {},
	spellAttack: async () => {},
	potion: async () => {},
	powerdown: async () => {},
	flyingDragon: async () => {},
	chest: async () => {},
	lightning: async () => {},
	miniBossFight: async () => {},
	finalBossFight: async () => {},
	ambushDeath: async () => {},
	roundEnd: async () => {},
};
