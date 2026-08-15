import { BALANCE } from '../config/balance';
import { MAP_HEIGHT, MAP_WIDTH } from '../world/officeMap';
import { SIGHT_OPACITY, OPACITY, type TileIndex } from '../world/tiles';
import type { CharDirection } from '../art/charFrames';

/**
 * Who can see you, and how well.
 *
 * THE ONE RULE THAT MAKES THIS A GAME: an observer's contribution depends on
 * where they are looking, not merely where they are. Dale parks at the end of
 * the aisle facing away for twenty-two minutes; if presence alone counted, his
 * sight of your desk would arrive as a step function — safe, then certainly
 * caught, then safe — and the player's only decision would be whether they
 * memorised his timetable. Gating on facing turns that step into a wave that
 * rises as he approaches and falls as he passes, and a wave is something you can
 * read, gamble against, and misjudge.
 *
 * Pure: no Phaser, no DOM. Unit-tested against the real office grid.
 */

/** Cheap integer indexing, matching npcPath's convention. */
const IDX = (x: number, y: number): number => y * MAP_WIDTH + x;

/**
 * Sight opacity is a SEPARATE grid from the walkable grid, because "blocks
 * walking" and "blocks seeing" are different sets and the difference is the
 * milestone. A desk blocks walking and not sight; a partition hides you when you
 * are seated and merely dims you when you stand.
 */
export function buildOpacityGrid(grid: TileIndex[][]): Uint8Array {
  const opacity = new Uint8Array(MAP_WIDTH * MAP_HEIGHT);
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      opacity[IDX(x, y)] = SIGHT_OPACITY[grid[y]![x]!] ?? OPACITY.CLEAR;
    }
  }
  return opacity;
}

export interface SightQuery {
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
  /** A seated target is below the partitions; a standing one is not. */
  readonly seated: boolean;
}

/**
 * How much of the target the ray survives: 1 clear, 0 blocked, fractions for a
 * standing target behind partitions.
 *
 * Traced with Bresenham from observer to target. NOT symmetric — Math.round
 * breaks ties the same way regardless of direction, so sightFactor(A→B) can
 * differ from sightFactor(B→A) on some even-step rays. Every caller queries
 * observer→target, so this is a stated property rather than a latent bug.
 */
export function sightFactor(opacity: Uint8Array, q: SightQuery): number {
  const dx = q.toX - q.fromX;
  const dy = q.toY - q.fromY;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  if (steps === 0) return 1;

  let factor = 1;
  let prevX = q.fromX;
  let prevY = q.fromY;

  for (let i = 1; i <= steps; i++) {
    const x = Math.round(q.fromX + (dx * i) / steps);
    const y = Math.round(q.fromY + (dy * i) / steps);
    if (x === q.toX && y === q.toY) break;
    if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return 0;

    const cell = opacity[IDX(x, y)]!;
    if (cell === OPACITY.OPAQUE) return 0;
    if (cell === OPACITY.HEAD_HEIGHT) {
      // Seated, you are below it. Standing, you are dimmed but visible.
      if (q.seated) return 0;
      factor *= BALANCE.sight.partitionAttenuation;
    }

    /**
     * A diagonal step slips between two cells; if BOTH are blocking, the corner
     * is sealed. A partition CORNER is a seam you can see through even seated;
     * a partition FACE is not. That asymmetry is what makes a cubicle mouth a
     * sightline and a cubicle wall a wall, and the whole catch depends on it —
     * so it is written down here and pinned by a test.
     */
    if (x !== prevX && y !== prevY) {
      const a = opacity[IDX(prevX, y)]!;
      const b = opacity[IDX(x, prevY)]!;
      const blocks = (cellValue: number): boolean =>
        cellValue === OPACITY.OPAQUE || (q.seated && cellValue === OPACITY.HEAD_HEIGHT);
      if (blocks(a) && blocks(b)) return 0;
    }

    prevX = x;
    prevY = y;
    if (factor <= BALANCE.sight.minFactor) return 0;
  }

  return factor;
}

/** Does the observer's facing put the target in front of them? */
export function frontOf(facing: CharDirection, fromX: number, fromY: number, toX: number, toY: number): boolean {
  const dx = toX - fromX;
  const dy = toY - fromY;
  switch (facing) {
    case 'up':
      return dy <= 0;
    case 'down':
      return dy >= 0;
    case 'left':
      return dx <= 0;
    case 'right':
      return dx >= 0;
    default:
      return true;
  }
}

export interface Observer {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly facing: CharDirection;
  /** Weight: how much this person's attention actually costs you. */
  readonly attention: number;
  /** Whether they file reports. Only these can catch you. */
  readonly reports: boolean;
}

export interface Look {
  /** 0..1 — how exposed your BODY is to this observer. */
  readonly body: number;
  /** 0..1 — how readable your SCREEN is. Requires them to be looking AT you. */
  readonly screen: number;
}

const EMPTY_LOOK: Look = { body: 0, screen: 0 };

/**
 * One observer's view of the target.
 *
 * BODY is attenuated by facing (you register in peripheral vision); SCREEN is
 * GATED by it, hard. A man with his back to your monitor cannot read your
 * monitor, and pretending otherwise was what flattened the whole mechanic into
 * a timetable.
 */
export function lookAt(
  opacity: Uint8Array,
  observer: Observer,
  targetX: number,
  targetY: number,
  seated: boolean,
): Look {
  const dist = Math.hypot(observer.x - targetX, observer.y - targetY);
  if (dist > BALANCE.sight.rangeTiles) return EMPTY_LOOK;

  const factor = sightFactor(opacity, {
    fromX: observer.x,
    fromY: observer.y,
    toX: targetX,
    toY: targetY,
    seated,
  });
  if (factor <= 0) return EMPTY_LOOK;

  // Linear falloff past the near band, so someone across the room registers
  // without dominating.
  const near = BALANCE.sight.nearTiles;
  const falloff =
    dist <= near ? 1 : Math.max(0, 1 - (dist - near) / Math.max(1, BALANCE.sight.rangeTiles - near));

  const facingTarget = frontOf(observer.facing, observer.x, observer.y, targetX, targetY);
  const bodyFacing = facingTarget ? 1 : BALANCE.sight.behindMultiplier;

  return {
    body: observer.attention * factor * falloff * bodyFacing,
    // Hard gate. This single line is the difference between a wave and a step.
    screen: facingTarget ? observer.attention * factor * falloff : 0,
  };
}

export interface Watched {
  /** 0..1 aggregate body exposure, the strongest single look. */
  readonly eyes: number;
  /** 0..1 screen exposure from REPORTING observers only. */
  readonly screen: number;
  /** The reporting observer with the clearest view of your screen, or null. */
  readonly watcherId: string | null;
}

/**
 * Aggregate the pool. Max rather than sum: two people glancing at you is not
 * twice as damning as one person staring, and a sum would make a crowded break
 * room read as more dangerous than your boss at your shoulder.
 */
export function watchedBy(
  opacity: Uint8Array,
  observers: readonly Observer[],
  targetX: number,
  targetY: number,
  seated: boolean,
): Watched {
  let eyes = 0;
  let screen = 0;
  let watcherId: string | null = null;

  for (const observer of observers) {
    const look = lookAt(opacity, observer, targetX, targetY, seated);
    if (look.body > eyes) eyes = look.body;
    // Only people who file reports can catch you. Marjorie reading over your
    // shoulder is gossip, not jeopardy.
    if (observer.reports && look.screen > screen) {
      screen = look.screen;
      watcherId = observer.id;
    }
  }

  return { eyes: Math.min(1, eyes), screen: Math.min(1, screen), watcherId };
}
