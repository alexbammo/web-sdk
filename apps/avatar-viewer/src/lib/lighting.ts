import * as THREE from 'three';
import type { TimeOfDay } from './types';

/** Approximate blackbody colour (Tanner Helland's fit), 1000K–12000K. */
export function kelvin(k: number): THREE.Color {
	const t = k / 100;
	let r: number, g: number, b: number;
	if (t <= 66) {
		r = 255;
		g = 99.4708025861 * Math.log(t) - 161.1195681661;
		b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
	} else {
		r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
		g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
		b = 255;
	}
	const c = (v: number) => Math.min(255, Math.max(0, v)) / 255;
	return new THREE.Color().setRGB(c(r), c(g), c(b), THREE.SRGBColorSpace);
}

export interface LightingPreset {
	/** Sun elevation / azimuth in degrees. */
	sunElevation: number;
	sunAzimuth: number;
	sunKelvin: number;
	sunIntensity: number;
	/** How strongly the HDRI lights the scene. */
	envIntensity: number;
	/** Warm practical lights (pendants, string lights, lamps). */
	practicalIntensity: number;
	/** Multiplier on the softbox key/fill/rim around the person. */
	portraitIntensity: number;
	exposure: number;
	fog: THREE.ColorRepresentation;
	fogDensity: number;
	bloom: number;
}

// Tuned for flattering business portraits: the sun is a gentle accent, most
// of the light comes from the sky (HDRI) and the softboxes, so faces stay soft
// and shadows diffuse.
export const LIGHTING: Record<TimeOfDay, LightingPreset> = {
	morning: {
		sunElevation: 24,
		sunAzimuth: 110,
		sunKelvin: 5000,
		sunIntensity: 1.6,
		envIntensity: 1.15,
		practicalIntensity: 0.3,
		portraitIntensity: 1,
		exposure: 1.0,
		fog: '#e3e8ee',
		fogDensity: 0.01,
		bloom: 0.08,
	},
	midday: {
		sunElevation: 50,
		sunAzimuth: 160,
		sunKelvin: 5700,
		sunIntensity: 1.9,
		envIntensity: 1.2,
		practicalIntensity: 0.1,
		portraitIntensity: 1,
		exposure: 0.95,
		fog: '#e8eef4',
		fogDensity: 0.008,
		bloom: 0.05,
	},
	golden: {
		sunElevation: 10,
		sunAzimuth: 250,
		sunKelvin: 3300,
		sunIntensity: 2.2,
		envIntensity: 0.95,
		practicalIntensity: 0.6,
		portraitIntensity: 0.9,
		exposure: 1.02,
		fog: '#efd2b0',
		fogDensity: 0.012,
		bloom: 0.15,
	},
	dusk: {
		sunElevation: 2,
		sunAzimuth: 265,
		sunKelvin: 2500,
		sunIntensity: 0.7,
		envIntensity: 0.7,
		practicalIntensity: 1.3,
		portraitIntensity: 0.85,
		exposure: 1.1,
		fog: '#6a6882',
		fogDensity: 0.014,
		bloom: 0.25,
	},
	night: {
		sunElevation: 35,
		sunAzimuth: 200,
		sunKelvin: 8000, // moonlight
		sunIntensity: 0.2,
		envIntensity: 0.4,
		practicalIntensity: 2,
		portraitIntensity: 0.8,
		exposure: 1.2,
		fog: '#1a2030',
		fogDensity: 0.018,
		bloom: 0.35,
	},
};

/** Colour for warm practical lights, pulled cooler/warmer by the direction's warmth. */
export function practicalColor(warmth: number): THREE.Color {
	return kelvin(THREE.MathUtils.lerp(3600, 2300, warmth));
}
