import type { CharDirection } from '../art/charFrames';
import type { Rng } from '../util/rng';
import { PLACES, type PlaceKey } from '../world/officeMap';
import { ROSTER, type ActorId } from './npcRoster';
import { Router, pathTiles } from './npcPath';
import { BALANCE } from '../config/balance';

/**
 * Where everyone is, at any minute of the day.
 *
 * THE ONE DECISION EVERYTHING FOLLOWS FROM: an NPC's position is a PURE FUNCTION
 * OF THE CLOCK. It is never simulated forward, never accumulated, never saved.
 *
 * That single choice closes five holes at once:
 *   - Determinism. Two machines at the same in-game minute compute the same tile,
 *     whatever their frame rates.
 *   - Pause. minutesFloat is frozen while the clock is held, so the floor stops
 *     mid-stride under a modal fax AND under a non-modal conversation, for free.
 *   - The day boundary. reset() puts the minute back to 0, and poseAt(plan, 0) IS
 *     everyone's 9:00 station. There is no separate reset path to forget.
 *   - The debug L key, which drives 480 minutes in one frame: a recompute is 480
 *     arithmetic evaluations rather than 480 tweens.
 *   - A fax charging 100 minutes while OfficeScene is paused. On resume the first
 *     sync places everyone exactly where the new minute says. Nothing to snap.
 *
 * Pure: no Phaser, no DOM.
 */

export interface ScheduleBlock {
  /** Minutes since 9:00 that this block begins. */
  readonly at: number;
  /** Where to be. `null` means off the floor entirely — not rendered. */
  readonly place: PlaceKey | null;
}

/**
 * The day's routine per actor. Structure rather than tuning, so it lives with
 * the code: a designer retuning numbers should not accidentally restage the cast.
 *
 * These are authored against PLACES keys, so findUnreachablePlaces() already
 * guards every destination against a map edit.
 */
export const SCHEDULES: Readonly<Record<ActorId, readonly ScheduleBlock[]>> = {
  // Nine years in the building, four hours in the chair. The 11:40 departure is
  // the scenario; `null` is him genuinely gone, not hiding somewhere findable.
  steve: [
    { at: 0, place: 'steveCubicle' },
    { at: 90, place: 'breakRoom' },
    { at: 125, place: 'steveCubicle' },
    { at: 160, place: null }, // 11:40. "A lunch with a drive attached."
    { at: 315, place: 'steveCubicle' }, // 2:15
    { at: 420, place: 'breakRoom' },
    { at: 450, place: 'steveCubicle' },
  ],

  // The circuit. She passes the player's own cubicle twice a day by design —
  // the information broker is the one NPC you never have to go looking for.
  marjorie: [
    { at: 0, place: 'mailDesk' },
    { at: 40, place: 'printerRoom' },
    { at: 70, place: 'playerCubicleMouth' },
    { at: 100, place: 'conferenceRoom' },
    { at: 140, place: 'mailDesk' },
    { at: 230, place: 'breakRoom' },
    { at: 270, place: 'printerRoom' },
    { at: 300, place: 'playerCubicleMouth' },
    { at: 340, place: 'mailDesk' },
  ],

  // The hermit. He emerges twice — more than the original design wanted, because
  // a character you never meet is indistinguishable from one nobody built.
  dennis: [
    { at: 0, place: 'itCloset' },
    { at: 175, place: 'breakRoom' },
    { at: 225, place: 'itCloset' },
    { at: 350, place: 'printerRoom' },
    { at: 395, place: 'itCloset' },
  ],

  // The metronome. Every block on a quarter hour, and jitterMinutes is ZERO, so
  // this is the one routine a player can actually learn. Lunch at 12:15, as she
  // will tell you, because everyone else takes it at noon.
  pat: [
    { at: 0, place: 'patCubicle' },
    { at: 75, place: 'supplyRoom' },
    { at: 105, place: 'patCubicle' },
    { at: 195, place: 'breakRoom' }, // 12:15
    { at: 240, place: 'patCubicle' },
    { at: 315, place: 'conferenceRoom' },
    { at: 345, place: 'patCubicle' },
    { at: 435, place: 'supplyRoom' },
    { at: 465, place: 'patCubicle' },
  ],

  // Management by walking around. The aisle walks are the thing you learn to
  // watch for, and M5 hangs getting caught on exactly these minutes.
  dale: [
    { at: 0, place: 'bossDesk' },
    { at: 55, place: 'farmAisle' },
    { at: 85, place: 'bossDesk' },
    { at: 150, place: 'conferenceRoom' },
    { at: 205, place: 'bossDesk' },
    { at: 285, place: 'farmAisle' },
    { at: 320, place: 'bossDesk' },
    { at: 415, place: 'farmAisle' },
    { at: 445, place: 'bossDesk' },
  ],
};

export interface PlanLeg {
  readonly startMinute: number;
  /** Tiles walked, flat [x0,y0,x1,y1,...]. Empty when off the floor. */
  readonly path: Int16Array;
  /** How many minutes the walk itself takes; parked for the remainder. */
  readonly travelMinutes: number;
  readonly offFloor: boolean;
  readonly facing: CharDirection;
}

export type DayPlan = Readonly<Record<string, readonly PlanLeg[]>>;

export interface NpcPose {
  x: number;
  y: number;
  facing: CharDirection;
  visible: boolean;
  moving: boolean;
}

/**
 * Resolve the day's routine into concrete legs.
 *
 * Jitter is per-actor and applied to every block but the first, so people are
 * not robots — except Pat, whose jitter is zero and who is the reason the option
 * exists at all.
 */
export function buildDayPlan(router: Router, rng: Rng): DayPlan {
  const plan: Record<string, PlanLeg[]> = {};

  for (const id of Object.keys(SCHEDULES) as ActorId[]) {
    const blocks = SCHEDULES[id];
    const jitter = ROSTER[id].jitterMinutes;
    // One draw per actor per day, so a plan is replayable from the seed.
    const wobble = jitter > 0 ? rng.int(-jitter, jitter) : 0;

    const legs: PlanLeg[] = [];
    let fromX = 0;
    let fromY = 0;

    blocks.forEach((block, index) => {
      const startMinute = index === 0 ? 0 : Math.max(1, block.at + wobble);

      if (block.place === null) {
        legs.push({ startMinute, path: new Int16Array(0), travelMinutes: 0, offFloor: true, facing: 'down' });
        return;
      }

      const dest = PLACES[block.place];
      if (index === 0) {
        // Everyone is simply AT their first station at 9:00. Nobody commutes
        // across the floor while the player is still reading the morning line.
        fromX = dest.x;
        fromY = dest.y;
        legs.push({
          startMinute,
          path: Int16Array.from([dest.x, dest.y]),
          travelMinutes: 0,
          offFloor: false,
          facing: ROSTER[id].restFacing,
        });
        return;
      }

      const path = router.between(fromX, fromY, dest.x, dest.y);
      const tiles = pathTiles(path);
      const wanted = Math.max(1, Math.round((tiles - 1) * BALANCE.npc.minutesPerTile));

      // Clamp so the walk always completes before the next appointment. Without
      // this an NPC is pulled onto the next route mid-stride and appears to
      // teleport, because every route is planned from the station they were
      // supposed to have reached.
      const nextBlock = blocks[index + 1];
      const gap = nextBlock ? Math.max(1, nextBlock.at + wobble - startMinute) : Number.MAX_SAFE_INTEGER;
      const travelMinutes = Math.max(1, Math.min(wanted, Math.floor(gap * BALANCE.npc.maxTravelFractionOfGap)));

      legs.push({
        startMinute,
        path,
        travelMinutes,
        offFloor: false,
        facing: ROSTER[id].restFacing,
      });
      fromX = dest.x;
      fromY = dest.y;
    });

    plan[id] = legs;
  }

  return plan;
}

function facingFor(dx: number, dy: number, fallback: CharDirection): CharDirection {
  if (dx === 0 && dy === 0) return fallback;
  if (Math.abs(dy) >= Math.abs(dx)) return dy > 0 ? 'down' : 'up';
  return dx > 0 ? 'right' : 'left';
}

/**
 * Where this actor is at this moment, in TILE units (fractional while walking).
 *
 * Pass the discrete minute for anything that makes a decision — is Steve in
 * range, is Dale at your aisle — and minutesFloat only for the sprite. That is
 * the events.ts contract: push discrete, pull continuous.
 *
 * Writes into `out` so the per-frame path allocates nothing.
 */
export function poseAt(plan: DayPlan, id: string, minutes: number, out: NpcPose): NpcPose {
  const legs = plan[id];
  if (!legs || legs.length === 0) {
    out.visible = false;
    out.moving = false;
    return out;
  }

  let leg = legs[0]!;
  for (let i = 0; i < legs.length; i++) {
    if (legs[i]!.startMinute <= minutes) leg = legs[i]!;
    else break;
  }

  if (leg.offFloor) {
    out.visible = false;
    out.moving = false;
    return out;
  }

  out.visible = true;
  const tiles = pathTiles(leg.path);
  if (tiles === 0) {
    out.visible = false;
    out.moving = false;
    return out;
  }

  const elapsed = minutes - leg.startMinute;
  if (leg.travelMinutes <= 0 || elapsed >= leg.travelMinutes || tiles === 1) {
    out.x = leg.path[(tiles - 1) * 2]!;
    out.y = leg.path[(tiles - 1) * 2 + 1]!;
    out.facing = leg.facing;
    out.moving = false;
    return out;
  }

  // Interpolate along the tile list. The fractional part is presentation only.
  const progress = Math.max(0, elapsed / leg.travelMinutes) * (tiles - 1);
  const index = Math.min(tiles - 2, Math.floor(progress));
  const frac = progress - index;

  const ax = leg.path[index * 2]!;
  const ay = leg.path[index * 2 + 1]!;
  const bx = leg.path[(index + 1) * 2]!;
  const by = leg.path[(index + 1) * 2 + 1]!;

  out.x = ax + (bx - ax) * frac;
  out.y = ay + (by - ay) * frac;
  out.facing = facingFor(bx - ax, by - ay, leg.facing);
  out.moving = true;
  return out;
}

export function createPose(): NpcPose {
  return { x: 0, y: 0, facing: 'down', visible: false, moving: false };
}
