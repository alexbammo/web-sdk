// Sprite sheet layout: 4 columns x 16 rows, 512x512 per frame
// All hero and monster animated sprites share this format

export const FRAME_SIZE = 512;
export const SHEET_COLS = 4;
export const SHEET_ROWS = 16;

// Animation row mappings (determined from visual inspection of warrior sprite)
// Rows are grouped by direction, each direction has: idle, walk, attack, alt
export const ANIM_ROWS = {
  // Front-facing (toward camera)
  FRONT_IDLE: 0,
  FRONT_WALK: 1,
  FRONT_ATTACK: 2,
  FRONT_ALT: 3,
  // Back-facing (away from camera)
  BACK_IDLE: 4,
  BACK_WALK: 5,
  BACK_ATTACK: 6,
  BACK_ALT: 7,
  // Right-facing (hero moves left-to-right) — PRIMARY for our game
  RIGHT_IDLE: 8,
  RIGHT_WALK: 9,
  RIGHT_ATTACK: 10,
  RIGHT_ALT: 11,
  // Left-facing
  LEFT_IDLE: 12,
  LEFT_WALK: 13,
  LEFT_ATTACK: 14,
  LEFT_ALT: 15,
} as const;

// For the game: hero faces RIGHT, enemies face LEFT
export const HERO_ANIMS = {
  idle: ANIM_ROWS.RIGHT_IDLE,
  run: ANIM_ROWS.RIGHT_WALK,
  attack: ANIM_ROWS.RIGHT_ATTACK,
};

export const ENEMY_ANIMS = {
  idle: ANIM_ROWS.LEFT_IDLE,
  walk: ANIM_ROWS.LEFT_WALK,
  hurt: ANIM_ROWS.FRONT_ALT, // use front alt as hurt
  death: ANIM_ROWS.FRONT_ATTACK, // repurpose as death
};

// Build frame rectangles for a given animation row
export function getAnimFrames(row: number): Array<{ x: number; y: number; w: number; h: number }> {
  const frames: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (let col = 0; col < SHEET_COLS; col++) {
    frames.push({
      x: col * FRAME_SIZE,
      y: row * FRAME_SIZE,
      w: FRAME_SIZE,
      h: FRAME_SIZE,
    });
  }
  return frames;
}
