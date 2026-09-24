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
	exposure: number;
	fog: THREE.ColorRepresentation;
	fogDensity: number;
	bloom: number;
}

export const LIGHTING: Record<TimeOfDay, LightingPreset> = {
	morning: {
		sunElevation: 22,
		sunAzimuth: 110,
		sunKelvin: 4800,
		sunIntensity: 3.2,
		envIntensity: 0.9,
		practicalIntensity: 0.4,
		exposure: 1.0,
		fog: '#dfe6ee',
		fogDensity: 0.012,
		bloom: 0.15,
	},
	midday: {
		sunElevation: 55,
		sunAzimuth: 160,
		sunKelvin: 5800,
		sunIntensity: 4.0,
		envIntensity: 1.0,
		practicalIntensity: 0.15,
		exposure: 0.95,
		fog: '#e8eef4',
		fogDensity: 0.008,
		bloom: 0.1,
	},
	golden: {
		sunElevation: 8,
		sunAzimuth: 250,
		sunKelvin: 2900,
		sunIntensity: 4.2,
		envIntensity: 0.8,
		practicalIntensity: 0.9,
		exposure: 1.05,
		fog: '#f0c79a',
		fogDensity: 0.014,
		bloom: 0.3,
	},
	dusk: {
		sunElevation: 1,
		sunAzimuth: 265,
		sunKelvin: 2200,
		sunIntensity: 1.1,
		envIntensity: 0.55,
		practicalIntensity: 1.6,
		exposure: 1.15,
		fog: '#5b5a78',
		fogDensity: 0.016,
		bloom: 0.45,
	},
	night: {
		sunElevation: 35,
		sunAzimuth: 200,
		sunKelvin: 8000, // moonlight
		sunIntensity: 0.25,
		envIntensity: 0.35,
		practicalIntensity: 2.4,
		exposure: 1.25,
		fog: '#141a2a',
		fogDensity: 0.02,
		bloom: 0.6,
	},
};

/** Colour for warm practical lights, pulled cooler/warmer by the direction's warmth. */
export function practicalColor(warmth: number): THREE.Color {
	return kelvin(THREE.MathUtils.lerp(3600, 2300, warmth));
}
