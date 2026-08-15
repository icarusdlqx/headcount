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

/** Number of tiles in the generated tileset, used to size the source texture. */
export const TILE_COUNT = 12;
