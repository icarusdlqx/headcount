/**
 * Tile vocabulary. The office map is authored as ASCII (see officeMap.ts) and
 * each character maps to one tile index in the generated tileset.
 */

export const TILE = {
  CARPET: 0,
  WALL: 1,
  CUBICLE: 2,
  DESK: 3,
  DOORWAY: 4,
  VINYL: 5,
  PRINTER: 6,
  FAX: 7,
  COOLER: 8,
  RACK: 9,
  TABLE: 10,
  PLANT: 11,
} as const;

export type TileIndex = (typeof TILE)[keyof typeof TILE];

/** Authoring character -> tile index. Keep this table and the legend in officeMap.ts in sync. */
export const CHAR_TO_TILE: Record<string, TileIndex> = {
  '.': TILE.CARPET,
  '#': TILE.WALL,
  c: TILE.CUBICLE,
  d: TILE.DESK,
  D: TILE.DOORWAY,
  t: TILE.VINYL,
  p: TILE.PRINTER,
  f: TILE.FAX,
  w: TILE.COOLER,
  s: TILE.RACK,
  T: TILE.TABLE,
  P: TILE.PLANT,
};

/** Tiles the player cannot walk through. */
export const SOLID_TILES: readonly TileIndex[] = [
  TILE.WALL,
  TILE.CUBICLE,
  TILE.DESK,
  TILE.PRINTER,
  TILE.FAX,
  TILE.COOLER,
  TILE.RACK,
  TILE.TABLE,
  TILE.PLANT,
];

/**
 * How much each tile blocks SIGHT, which is a different question from how much
 * it blocks walking — and the difference is the whole of M5. A desk stops you
 * walking and not seeing; a cubicle partition hides a SEATED person and merely
 * dims a standing one, which is what makes ducking behind your own monitor mean
 * something.
 */
export const OPACITY = { CLEAR: 0, HEAD_HEIGHT: 1, OPAQUE: 2 } as const;
export type Opacity = (typeof OPACITY)[keyof typeof OPACITY];

export const SIGHT_OPACITY: Readonly<Record<number, Opacity>> = {
  [TILE.WALL]: OPACITY.OPAQUE,
  [TILE.RACK]: OPACITY.OPAQUE,
  /** The load-bearing one. */
  [TILE.CUBICLE]: OPACITY.HEAD_HEIGHT,
  /** Your head is above your desk, so a desk hides nobody. */
  [TILE.DESK]: OPACITY.CLEAR,
  [TILE.TABLE]: OPACITY.CLEAR,
  [TILE.CARPET]: OPACITY.CLEAR,
  /** Load-bearing the other way: a doorway is a sightline, which is why Dale's
   *  office door matters and why the corridor is exposed. */
  [TILE.DOORWAY]: OPACITY.CLEAR,
  [TILE.VINYL]: OPACITY.CLEAR,
  [TILE.PRINTER]: OPACITY.HEAD_HEIGHT,
  [TILE.FAX]: OPACITY.HEAD_HEIGHT,
  [TILE.COOLER]: OPACITY.HEAD_HEIGHT,
  [TILE.PLANT]: OPACITY.HEAD_HEIGHT,
};

/** Number of tiles in the generated tileset, used to size the source texture. */
export const TILE_COUNT = 12;
