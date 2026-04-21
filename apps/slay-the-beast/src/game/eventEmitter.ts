import { createEventEmitter } from 'utils-event-emitter';

import type { EmitterEventGame } from './typesEmitterEvent';

export type EmitterEvent = EmitterEventGame;

export const { eventEmitter } = createEventEmitter<EmitterEvent>();
