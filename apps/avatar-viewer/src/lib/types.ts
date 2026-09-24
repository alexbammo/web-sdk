// Shared between the browser app and the API server.

export const SCENE_IDS = ['cafe', 'veranda', 'loft', 'library', 'rooftop'] as const;
export type SceneId = (typeof SCENE_IDS)[number];

export const TIMES_OF_DAY = ['morning', 'midday', 'golden', 'dusk', 'night'] as const;
export type TimeOfDay = (typeof TIMES_OF_DAY)[number];

export const PROP_IDS = [
	'coffee',
	'tea',
	'wine',
	'laptop',
	'books',
	'plants',
	'flowers',
	'sketchbook',
	'camera',
	'headphones',
	'notebook',
] as const;
export type PropId = (typeof PROP_IDS)[number];

/** What the analysis step decides about a person's scene. */
export interface SceneDirection {
	scene: SceneId;
	timeOfDay: TimeOfDay;
	/** Hex colour used for textiles, cushions and small accents. */
	accentColor: string;
	/** 0 = cool/neutral, 1 = very warm (candle-lit). */
	warmth: number;
	props: PropId[];
	/** One-line caption shown in the viewer, e.g. "Morning espresso before a design review". */
	caption: string;
	/** Short explanation of why this scene was chosen. */
	reasoning: string;
	source: 'claude' | 'heuristic';
}

export interface ProfileInput {
	name?: string;
	headline?: string;
	about?: string;
	/** Free text: recent posts, skills, anything the person pasted in. */
	extra?: string;
	/** JPEG/PNG data URL of the profile photo, already downscaled by the client. */
	photo?: string;
}

export interface LinkedInIdentity {
	name: string;
	givenName?: string;
	familyName?: string;
	picture?: string;
	email?: string;
	locale?: string;
}

export interface ServerConfig {
	claude: boolean;
	linkedin: boolean;
	avatarProvider: 'meshy' | 'fal' | null;
}

export type AvatarJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface AvatarJob {
	id: string;
	status: AvatarJobStatus;
	progress: number;
	provider: 'meshy' | 'fal';
	error?: string;
	/** Same-origin URL the viewer can load the GLB from. */
	modelUrl?: string;
}
