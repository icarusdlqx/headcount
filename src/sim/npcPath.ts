import { MAP_HEIGHT, MAP_WIDTH } from '../world/officeMap';
import { SOLID_TILES, type TileIndex } from '../world/tiles';

/**
 * Routes, derived from the map rather than authored.
 *
 * A designer never maintains a polyline: waypoints are named places, and the
 * tiles between them come from a BFS distance field over the real grid. Edit the
 * ASCII map and the whole cast re-routes instead of silently walking through a
 * new wall.
 *
 * No A*. Distance fields are computed once per goal at boot and memoised, so
 * there is no per-agent replanning, no cache invalidation, and nothing that can
 * differ between two machines. Same flood-fill primitive findUnreachablePlaces()
 * already uses.
 *
 * Pure: no Phaser, no DOM.
 */

const IDX = (x: number, y: number): number => y * MAP_WIDTH + x;

export function buildWalkGrid(grid: TileIndex[][]): Uint8Array {
  const walk = new Uint8Array(MAP_WIDTH * MAP_HEIGHT);
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      walk[IDX(x, y)] = SOLID_TILES.includes(grid[y]![x]!) ? 0 : 1;
    }
  }
  return walk;
}

/** BFS distance field from a goal. -1 means unreachable. */
export function buildDistanceField(walk: Uint8Array, goalX: number, goalY: number): Int16Array {
  const field = new Int16Array(MAP_WIDTH * MAP_HEIGHT).fill(-1);
  if (!walk[IDX(goalX, goalY)]) return field;

  field[IDX(goalX, goalY)] = 0;
  // A plain array used as a ring buffer: the grid is 1200 cells, so the queue
  // never grows enough for shift()'s cost to matter, and head/tail avoids it.
  const queue = new Int16Array(MAP_WIDTH * MAP_HEIGHT * 2);
  let head = 0;
  let tail = 0;
  queue[tail++] = goalX;
  queue[tail++] = goalY;

  while (head < tail) {
    const x = queue[head++]!;
    const y = queue[head++]!;
    const next = field[IDX(x, y)]! + 1;

    for (let d = 0; d < 4; d++) {
      const nx = x + (d === 0 ? 1 : d === 2 ? -1 : 0);
      const ny = y + (d === 1 ? 1 : d === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= MAP_WIDTH || ny >= MAP_HEIGHT) continue;
      const at = IDX(nx, ny);
      if (!walk[at] || field[at] !== -1) continue;
      field[at] = next;
      queue[tail++] = nx;
      queue[tail++] = ny;
    }
  }
  return field;
}

/** right, down, left, up — the fallback order when the heading cannot continue. */
const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

/**
 * Walk the gradient down to the field's goal, as a flat [x0,y0,x1,y1,...] path.
 *
 * THE TIE-BREAK IS THE WHOLE LOOK OF THE GAME: among neighbours exactly one step
 * closer, prefer to CONTINUE THE CURRENT HEADING. Without it every corridor
 * staircases diagonally and the entire cast walks like it is drunk.
 *
 * Always returns at least the origin, so callers never index into an empty path.
 */
export function tracePath(walk: Uint8Array, field: Int16Array, fromX: number, fromY: number): Int16Array {
  const out: number[] = [fromX, fromY];
  let x = fromX;
  let y = fromY;
  let headingX = 0;
  let headingY = 0;

  let guard = 0;
  while (field[IDX(x, y)]! > 0 && guard++ < MAP_WIDTH * MAP_HEIGHT) {
    const target = field[IDX(x, y)]! - 1;
    let bestX = -1;
    let bestY = -1;

    // Continue straight if that is still a legal step downhill.
    if (headingX !== 0 || headingY !== 0) {
      const nx = x + headingX;
      const ny = y + headingY;
      if (nx >= 0 && ny >= 0 && nx < MAP_WIDTH && ny < MAP_HEIGHT && walk[IDX(nx, ny)] && field[IDX(nx, ny)] === target) {
        bestX = nx;
        bestY = ny;
      }
    }

    if (bestX < 0) {
      for (const [dx, dy] of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= MAP_WIDTH || ny >= MAP_HEIGHT) continue;
        if (!walk[IDX(nx, ny)] || field[IDX(nx, ny)] !== target) continue;
        bestX = nx;
        bestY = ny;
        break;
      }
    }

    if (bestX < 0) break; // unreachable; stop where we are rather than throw
    headingX = bestX - x;
    headingY = bestY - y;
    x = bestX;
    y = bestY;
    out.push(x, y);
  }

  return Int16Array.from(out);
}

/** Number of tiles in a flat path. */
export function pathTiles(path: Int16Array): number {
  return path.length / 2;
}

/** A memoising router. One instance is built at boot and shared by the cast. */
export class Router {
  private readonly walk: Uint8Array;
  private readonly fields = new Map<number, Int16Array>();
  private readonly paths = new Map<string, Int16Array>();

  constructor(grid: TileIndex[][]) {
    this.walk = buildWalkGrid(grid);
  }

  isWalkable(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return false;
    return this.walk[IDX(x, y)] === 1;
  }

  /** Paths do not depend on the day, so this cache is never invalidated. */
  between(fromX: number, fromY: number, toX: number, toY: number): Int16Array {
    const key = `${fromX},${fromY}>${toX},${toY}`;
    const hit = this.paths.get(key);
    if (hit) return hit;

    const goal = IDX(toX, toY);
    let field = this.fields.get(goal);
    if (!field) {
      field = buildDistanceField(this.walk, toX, toY);
      this.fields.set(goal, field);
    }

    const path = tracePath(this.walk, field, fromX, fromY);
    this.paths.set(key, path);
    return path;
  }
}
