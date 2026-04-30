import * as PIXI from 'pixi.js';

// Mirrors prototype/src/lib/spriteData.ts. All hero / fodder / big-enemy sheets
// share a 4×16 layout at 512px per frame. We only need a single still frame per
// sprite for the v1 demo (no walk-cycle animation yet), so each helper returns
// one cropped sub-texture from the loaded sheet.

export const FRAME_SIZE = 512;
export const SHEET_COLS = 4;

export const ANIM_ROWS = {
	FRONT_IDLE: 0,
	RIGHT_IDLE: 8,
	LEFT_IDLE: 12,
} as const;

// Build a sub-texture for a single (row, col) cell of a 4×16 sheet.
export const sheetFrame = (
	sheet: PIXI.Texture,
	row: number,
	col: number = 0,
): PIXI.Texture => {
	return new PIXI.Texture({
		source: sheet.source,
		frame: new PIXI.Rectangle(col * FRAME_SIZE, row * FRAME_SIZE, FRAME_SIZE, FRAME_SIZE),
	});
};

// Hero faces RIGHT. Use first frame of RIGHT_IDLE.
export const heroIdleFrame = (sheet: PIXI.Texture) => sheetFrame(sheet, ANIM_ROWS.RIGHT_IDLE, 0);

// Fodder + big enemies face LEFT (toward incoming hero). Use first frame of LEFT_IDLE.
export const enemyIdleFrame = (sheet: PIXI.Texture) => sheetFrame(sheet, ANIM_ROWS.LEFT_IDLE, 0);
