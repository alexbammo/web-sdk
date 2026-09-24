// Shared between the browser app and the API server.

export const SCENE_IDS = ['office', 'cafe', 'veranda', 'loft', 'library', 'rooftop'] as const;
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
	/**
	 * Full outfit for the 3D recreation, head to toe, continuing what they wear
	 * in the photo, e.g. "a navy blazer over a white shirt, dark chinos, brown loafers".
	 */
	outfit: string;
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
	avatar: {
		/** Service that builds the mesh, or null if 3D generation is off. */
		mesh: 'meshy' | 'fal' | null;
		/** Whether a headshot can be re-drawn full-length (needs fal). */
		fullBodyFromHeadshot: boolean;
	};
	/** Whether exported stills can get the photographic finishing pass (needs fal). */
	photoFinish: boolean;
}

export interface AvatarRequest {
	/** Data URL of the photo. */
	photo: string;
	/** True when the photo already shows the whole person, so no re-drawing is needed. */
	fullBodyPhoto?: boolean;
	outfit?: string;
}

export type AvatarJobStatus = 'running' | 'succeeded' | 'failed';

export interface AvatarJob {
	id: string;
	status: AvatarJobStatus;
	/** reference = full-length photo, views = side and back photos, mesh = building the 3D model. */
	stage: 'reference' | 'views' | 'mesh';
	progress: number;
	meshProvider?: 'meshy' | 'fal';
	error?: string;
	/** The full-length reference image the mesh is built from. */
	referenceUrl?: string;
	/** Same-origin URL the viewer can load the GLB from. */
	modelUrl?: string;
}

/** Aspect ratios for exported stills: LinkedIn profile photo, and a landscape post image. */
export const STILL_ASPECTS = { '1:1': [1, 1], '16:9': [16, 9] } as const;
export type StillAspect = keyof typeof STILL_ASPECTS;

export interface FinishRequest {
	/** PNG/JPEG data URL of the current 3D render. */
	render: string;
	/** Data URL of the person's original photo, used as the identity reference. */
	photo: string;
	aspect: StillAspect;
}

export interface FinishJob {
	id: string;
	status: AvatarJobStatus;
	imageUrl?: string;
	error?: string;
}
