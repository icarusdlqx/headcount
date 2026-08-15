import { describe, expect, it } from 'vitest';
import { makeRng } from '../util/rng';
import { PLACES, buildTileGrid } from '../world/officeMap';
import { SOLID_TILES } from '../world/tiles';
import { Router, pathTiles } from './npcPath';
import { SCHEDULES, buildDayPlan, createPose, poseAt } from './npcSchedule';
import { ACTOR_IDS, ROSTER } from './npcRoster';

const grid = buildTileGrid();
const router = new Router(grid);
const plan = buildDayPlan(router, makeRng(4242));

function isSolidAt(x: number, y: number): boolean {
  return SOLID_TILES.includes(grid[y]![x]!);
}

describe('routing', () => {
  it('never routes anyone through a wall', () => {
    // The property that matters: a path is only as good as the grid it came
    // from, and a single bad step means someone walks through a partition in
    // front of the player.
    const path = router.between(PLACES.mailDesk.x, PLACES.mailDesk.y, PLACES.bossDesk.x, PLACES.bossDesk.y);
    expect(pathTiles(path)).toBeGreaterThan(10);
    for (let i = 0; i < pathTiles(path); i++) {
      expect(isSolidAt(path[i * 2]!, path[i * 2 + 1]!)).toBe(false);
    }
  });

  it('produces contiguous single-tile steps', () => {
    const path = router.between(PLACES.itCloset.x, PLACES.itCloset.y, PLACES.breakRoom.x, PLACES.breakRoom.y);
    for (let i = 1; i < pathTiles(path); i++) {
      const dx = Math.abs(path[i * 2]! - path[(i - 1) * 2]!);
      const dy = Math.abs(path[i * 2 + 1]! - path[(i - 1) * 2 + 1]!);
      expect(dx + dy).toBe(1);
    }
  });

  it('reaches every station the schedules name', () => {
    for (const id of ACTOR_IDS) {
      for (const block of SCHEDULES[id]) {
        if (block.place === null) continue;
        const dest = PLACES[block.place];
        const path = router.between(PLACES.playerCubicle.x, PLACES.playerCubicle.y, dest.x, dest.y);
        const last = pathTiles(path) - 1;
        expect([path[last * 2], path[last * 2 + 1]]).toEqual([dest.x, dest.y]);
      }
    }
  });

  it('returns the origin rather than an empty path when asked for a wall', () => {
    // Callers index into this without checking; an empty array would be a crash
    // inside the render loop.
    const path = router.between(PLACES.playerCubicle.x, PLACES.playerCubicle.y, 0, 0);
    expect(pathTiles(path)).toBeGreaterThanOrEqual(1);
  });
});

describe('poses are a pure function of the clock', () => {
  it('gives the same answer however you arrive at a minute', () => {
    // This is what makes the cast deterministic across frame rates and correct
    // after a fax charges 100 minutes while the scene was paused.
    const a = poseAt(plan, 'pat', 250, createPose());
    const b = poseAt(plan, 'pat', 250, createPose());
    expect(a).toEqual(b);
  });

  it('puts everyone at their first station at 9:00 sharp', () => {
    for (const id of ACTOR_IDS) {
      const pose = poseAt(plan, id, 0, createPose());
      const first = SCHEDULES[id][0]!;
      if (first.place === null) continue;
      expect(pose.visible).toBe(true);
      expect([pose.x, pose.y]).toEqual([PLACES[first.place].x, PLACES[first.place].y]);
      // Nobody commutes across the floor while the player reads the morning line.
      expect(pose.moving).toBe(false);
    }
  });

  it('never places anyone inside a wall, at any minute of any day', () => {
    for (let minute = 0; minute <= 480; minute++) {
      for (const id of ACTOR_IDS) {
        const pose = poseAt(plan, id, minute, createPose());
        if (!pose.visible) continue;
        expect(isSolidAt(Math.round(pose.x), Math.round(pose.y))).toBe(false);
      }
    }
  });

  it('takes Steve off the floor for his lunch and brings him back', () => {
    // He is genuinely gone, not hiding somewhere the player could catch him —
    // which is what makes covering for him a real lie.
    expect(poseAt(plan, 'steve', 120, createPose()).visible).toBe(true);
    expect(poseAt(plan, 'steve', 200, createPose()).visible).toBe(false);
    expect(poseAt(plan, 'steve', 400, createPose()).visible).toBe(true);
  });

  it('keeps Pat on the clock and lets the others drift', () => {
    // Pat is the one routine a player can learn. Jitter would destroy the only
    // thing she is for.
    expect(ROSTER.pat.jitterMinutes).toBe(0);

    const planA = buildDayPlan(router, makeRng(1));
    const planB = buildDayPlan(router, makeRng(2));
    const patA = planA['pat']!.map((leg) => leg.startMinute);
    const patB = planB['pat']!.map((leg) => leg.startMinute);
    expect(patA).toEqual(patB);

    // ...while somebody with jitter genuinely varies day to day.
    expect(ROSTER.marjorie.jitterMinutes).toBeGreaterThan(0);
  });

  it('brings Marjorie past the player twice a day', () => {
    // She is the information broker you never have to hunt for, and that is a
    // property of the schedule rather than a promise in a comment.
    const visits = SCHEDULES.marjorie.filter((block) => block.place === 'playerCubicle');
    expect(visits.length).toBe(2);
  });

  it('replays identically from the same seed', () => {
    const again = buildDayPlan(router, makeRng(4242));
    for (const id of ACTOR_IDS) {
      expect(again[id]!.map((l) => l.startMinute)).toEqual(plan[id]!.map((l) => l.startMinute));
    }
  });
});
