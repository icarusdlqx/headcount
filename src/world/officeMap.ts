import { CHAR_TO_TILE, SOLID_TILES, type TileIndex } from './tiles';

/**
 * The office, authored as ASCII so it can be edited without tooling.
 *
 * LEGEND
 *   .  carpet (walkable)      #  wall
 *   c  cubicle partition      d  desk
 *   D  doorway (walkable)     t  vinyl floor (walkable)
 *   p  printer                f  fax machine
 *   w  water cooler           s  server rack
 *   T  table (conference / break room)
 *   P  potted plant, allegedly real
 *
 * COLUMN BUDGET (40 wide)
 *   0      outer wall
 *   1-10   west rooms: boss's office, conference room, bathroom, IT closet
 *   11     west partition wall (doors punched with D)
 *   12-13  west corridor
 *   14-27  the cubicle farm
 *   28-29  east corridor
 *   30     east partition wall (doors punched with D)
 *   31-38  east rooms: break room, printer/fax room, supply & mail
 *   39     outer wall
 */
export const OFFICE_MAP: readonly string[] = [
  '########################################',
  '#..........#..................#tttttttt#',
  '#..dddd....#...cccc..cccc.....#ttTTTTtt#',
  '#..dddd....#...cddc..cddc.....#ttTTTTtt#',
  '#..........D...c..c..c..c.....#tttttttt#',
  '#P.........D..................Dtttttttt#',
  '#..........#..................Dtttttttt#',
  '#..........#...cccc..cccc.....#ttTTTTtt#',
  '############...cddc..cddc.....#wttttttt#',
  '#..........#...c..c..c..c.....#tttttttP#',
  '#..TTTTTT..#..................##########',
  '#..TTTTTT..#..................#..pp....#',
  '#..TTTTTT..#...cccc..cccc.....#........#',
  '#..........D...cddc..cddc.....D........#',
  '#P.........D...c..c..c..c.....D..ff....#',
  '#..........#..................#........#',
  '#..........#..................#.......P#',
  '############...cccc..cccc.....#........#',
  '#tttttttttt#...cddc..cddc.....#........#',
  '#tttttttttt#...c..c..c..c.....##########',
  '#ttttttttttD..................#dddd....#',
  '#ttttttttttD..................#........#',
  '#tttttttttt#...cccc..cccc.....#........#',
  '#tttttttttt#...cddc..cddc.....#....dddd#',
  '############...c..c..c..c.....D........#',
  '#.ssssss...#..................D........#',
  '#..........D.......w..........#dddd....#',
  '#..........D..................#........#',
  '#..........#..................#........#',
  '########################################',
];

export const MAP_WIDTH = 40;
export const MAP_HEIGHT = 30;

/** Where the player starts each morning: their own cubicle, second pod, west column. */
export const PLAYER_SPAWN_TILE = { x: 16, y: 4 } as const;

/**
 * Named places, for the day loop, NPC schedules and debug teleports later.
 * Coordinates are tile-space, at a walkable spot inside each room.
 */
export const PLACES = {
  playerCubicle: { x: 16, y: 4, label: 'Your cubicle' },
  bossOffice: { x: 5, y: 5, label: "Boss's office" },
  conferenceRoom: { x: 5, y: 14, label: 'Conference room' },
  bathroom: { x: 5, y: 21, label: 'Bathroom' },
  itCloset: { x: 5, y: 27, label: 'IT closet' },
  breakRoom: { x: 34, y: 5, label: 'Break room' },
  printerRoom: { x: 34, y: 13, label: 'Printer / fax room' },
  supplyRoom: { x: 34, y: 24, label: 'Supply & mail' },

  // The cast's stations. In PLACES rather than the roster so that
  // findUnreachablePlaces() guards every one of them against a map edit for free.
  steveCubicle: { x: 22, y: 4, label: "Steve's cubicle" },
  patCubicle: { x: 16, y: 9, label: "Pat's cubicle" },
  mailDesk: { x: 35, y: 26, label: 'The mail desk' },
  bossDesk: { x: 5, y: 4, label: "Dale's desk" },
  /** The middle of the cubicle farm, where Dale's walkthrough passes. */
  farmAisle: { x: 19, y: 5, label: 'The aisle' },
} as const;

export type PlaceKey = keyof typeof PLACES;

export interface RoomRect {
  readonly name: string;
  /** Inclusive tile bounds. */
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/**
 * Room bounds, used for the status readout now and for NPC schedules, ambient
 * audio zones and boss line-of-sight later. First match wins, so the corridors
 * sit last as the fallback.
 */
export const ROOMS: readonly RoomRect[] = [
  { name: "Boss's office", x1: 1, y1: 1, x2: 10, y2: 7 },
  { name: 'Conference room', x1: 1, y1: 9, x2: 10, y2: 16 },
  { name: 'Bathroom', x1: 1, y1: 18, x2: 10, y2: 23 },
  { name: 'IT closet', x1: 1, y1: 25, x2: 10, y2: 28 },
  { name: 'Break room', x1: 31, y1: 1, x2: 38, y2: 9 },
  { name: 'Printer / fax room', x1: 31, y1: 11, x2: 38, y2: 18 },
  { name: 'Supply & mail', x1: 31, y1: 20, x2: 38, y2: 28 },
  { name: 'The cubicle farm', x1: 14, y1: 1, x2: 27, y2: 28 },
  { name: 'The corridor', x1: 11, y1: 1, x2: 30, y2: 28 },
];

/**
 * Which room a tile belongs to. The fallback is passed in rather than written
 * here: it is prose, and prose lives in src/content/. The ROOMS names above are
 * the deliberate exception — they double as data keys for M4 schedules and M5
 * line-of-sight, so moving them to JSON would split one identity across two files.
 */
export function roomAt(tileX: number, tileY: number, fallback: string): string {
  for (const room of ROOMS) {
    if (tileX >= room.x1 && tileX <= room.x2 && tileY >= room.y1 && tileY <= room.y2) {
      return room.name;
    }
  }
  return fallback;
}

/**
 * Parse the ASCII map into a tile-index grid.
 *
 * Throws loudly on a malformed map: a ragged row or an unknown character is a
 * designer typo, and finding it at boot beats finding it as an invisible hole
 * in a wall three weeks later.
 */
export function buildTileGrid(rows: readonly string[] = OFFICE_MAP): TileIndex[][] {
  if (rows.length !== MAP_HEIGHT) {
    throw new Error(`officeMap: expected ${MAP_HEIGHT} rows, got ${rows.length}`);
  }

  return rows.map((row, y) => {
    if (row.length !== MAP_WIDTH) {
      throw new Error(`officeMap: row ${y} is ${row.length} chars, expected ${MAP_WIDTH}`);
    }
    return Array.from(row, (char, x) => {
      const tile = CHAR_TO_TILE[char];
      if (tile === undefined) {
        throw new Error(`officeMap: unknown character "${char}" at (${x}, ${y})`);
      }
      return tile;
    });
  });
}

/**
 * Dev-only sanity check: flood-fill from the spawn and confirm every named place
 * is still walkable-to. One mistyped character can seal off the break room, and
 * that is the kind of bug you find by wandering for ten minutes otherwise.
 * Returns the list of problems; empty means the floor plan is sound.
 */
export function findUnreachablePlaces(grid: TileIndex[][]): string[] {
  const walkable = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return false;
    return !SOLID_TILES.includes(grid[y]![x]!);
  };

  const seen = new Set<number>();
  const stack: number[] = [PLAYER_SPAWN_TILE.y * MAP_WIDTH + PLAYER_SPAWN_TILE.x];
  seen.add(stack[0]!);

  while (stack.length > 0) {
    const key = stack.pop()!;
    const x = key % MAP_WIDTH;
    const y = (key - x) / MAP_WIDTH;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      const nkey = ny * MAP_WIDTH + nx;
      if (seen.has(nkey) || !walkable(nx, ny)) continue;
      seen.add(nkey);
      stack.push(nkey);
    }
  }

  return Object.entries(PLACES)
    .filter(([, place]) => !seen.has(place.y * MAP_WIDTH + place.x))
    .map(([key, place]) => `${key} (${place.label}) at ${place.x},${place.y}`);
}
