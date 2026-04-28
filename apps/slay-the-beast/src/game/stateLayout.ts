import { createLayout } from 'utils-layout';

// Portrait-first sizes. Landscape is supported but the visual port (Stream 2)
// targets the prototype-portrait look. backgroundRatio is a placeholder until
// the real biome backgrounds land.
export const { stateLayout, stateLayoutDerived } = createLayout({
	backgroundRatio: {
		normal: 16 / 9,
		portrait: 9 / 16,
	},
	mainSizesMap: {
		desktop: { width: 540, height: 960 },
		tablet: { width: 540, height: 960 },
		landscape: { width: 960, height: 540 },
		portrait: { width: 540, height: 960 },
	},
});
