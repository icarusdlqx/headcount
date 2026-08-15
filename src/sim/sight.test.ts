import { describe, expect, it } from 'vitest';
import { makeRng } from '../util/rng';
import { PLACES, buildTileGrid } from '../world/officeMap';
import { Router } from './npcPath';
import { buildDayPlan, createPose, poseAt } from './npcSchedule';
import { ROSTER } from './npcRoster';
import { buildOpacityGrid, frontOf, lookAt, sightFactor, watchedBy, type Observer } from './sight';

const grid = buildTileGrid();
const opacity = buildOpacityGrid(grid);
const router = new Router(grid);
const plan = buildDayPlan(router, makeRng(4242));

const SEAT = PLACES.playerCubicle; // (16,4)

const observer = (over: Partial<Observer> = {}): Observer => ({
  id: 'dale',
  x: PLACES.farmAisle.x,
  y: PLACES.farmAisle.y,
  facing: 'left',
  attention: 1,
  reports: true,
  ...over,
});

describe('what blocks sight', () => {
  it('hides a SEATED player behind their own partition, and dims a standing one', () => {
    // The whole reason a cubicle is a cubicle.
    const from = { fromX: PLACES.bossDesk.x, fromY: PLACES.bossDesk.y, toX: SEAT.x, toY: SEAT.y };
    expect(sightFactor(opacity, { ...from, seated: true })).toBe(0);
    expect(sightFactor(opacity, { ...from, seated: false })).toBeGreaterThan(0);
  });

  it('treats a partition CORNER as a seam and a partition FACE as a wall', () => {
    // This asymmetry is what makes the cubicle mouth a sightline. If a
    // consistency refactor ever seals the corner, the catch becomes unreachable
    // and the whole milestone goes quietly inert — so it is pinned here.
    const throughMouth = sightFactor(opacity, {
      fromX: PLACES.farmAisle.x,
      fromY: PLACES.farmAisle.y,
      toX: SEAT.x,
      toY: SEAT.y,
      seated: true,
    });
    expect(throughMouth).toBeGreaterThan(0);
  });

  it('never sees through a wall, seated or standing', () => {
    // The bathroom is on the far side of the building's spine.
    for (const seated of [true, false]) {
      expect(
        sightFactor(opacity, {
          fromX: PLACES.farmAisle.x,
          fromY: PLACES.farmAisle.y,
          toX: PLACES.bathroom.x,
          toY: PLACES.bathroom.y,
          seated,
        }),
      ).toBe(0);
    }
  });
});

describe('facing', () => {
  it('gates the screen channel outright and only dims the body', () => {
    // The fix the design review demanded. A man facing away from your monitor
    // cannot read your monitor; without this, his 22-minute stationary park made
    // exposure a step function and the game a timetable to memorise.
    const toward = lookAt(opacity, observer({ facing: 'left' }), SEAT.x, SEAT.y, true);
    const away = lookAt(opacity, observer({ facing: 'right' }), SEAT.x, SEAT.y, true);

    expect(toward.screen).toBeGreaterThan(0);
    expect(away.screen).toBe(0);
    // You still register in his peripheral vision.
    expect(away.body).toBeGreaterThan(0);
    expect(away.body).toBeLessThan(toward.body);
  });

  it('knows what is in front of whom', () => {
    expect(frontOf('left', 19, 5, 16, 4)).toBe(true);
    expect(frontOf('right', 19, 5, 16, 4)).toBe(false);
    expect(frontOf('up', 19, 5, 19, 2)).toBe(true);
    expect(frontOf('down', 19, 5, 19, 2)).toBe(false);
  });
});

describe('the pool', () => {
  it('only lets people who file reports read your screen', () => {
    // Marjorie reading over your shoulder is gossip, not jeopardy.
    const gossip = watchedBy(opacity, [observer({ id: 'marjorie', reports: false })], SEAT.x, SEAT.y, true);
    expect(gossip.screen).toBe(0);
    expect(gossip.watcherId).toBeNull();
    // ...but she still counts toward how exposed you feel.
    expect(gossip.eyes).toBeGreaterThan(0);
  });

  it('takes the strongest look rather than summing', () => {
    // A crowded break room must not read as more dangerous than the boss at
    // your shoulder.
    const one = watchedBy(opacity, [observer()], SEAT.x, SEAT.y, true);
    const three = watchedBy(
      opacity,
      [observer(), observer({ id: 'a', reports: false }), observer({ id: 'b', reports: false })],
      SEAT.x,
      SEAT.y,
      true,
    );
    expect(three.eyes).toBeCloseTo(one.eyes, 5);
  });
});

/**
 * The measurement the design review ran to condemn the original design: it found
 * Dale's sight of the seat arrived in runs of [27, 1, 1, 32, 27] minutes against
 * a 6-minute threshold — open the board during a walkthrough and you are caught
 * for certain; open it at any other time and you are safe for certain. That is a
 * timetable, not a risk.
 */
describe('the exposure profile across a real day', () => {
  const sample = (minute: number): number => {
    const pose = poseAt(plan, 'dale', minute, createPose());
    if (!pose.visible) return 0;
    return lookAt(
      opacity,
      {
        id: 'dale',
        x: Math.round(pose.x),
        y: Math.round(pose.y),
        facing: pose.facing,
        attention: 1,
        reports: true,
      },
      SEAT.x,
      SEAT.y,
      true,
    ).screen;
  };

  it('is graded rather than binary — the fix the review demanded', () => {
    const values: number[] = [];
    for (let minute = 0; minute <= 480; minute++) values.push(sample(minute));

    const live = values.filter((v) => v > 0);
    expect(live.length).toBeGreaterThan(0);

    // The property that matters: partial exposure exists. If every non-zero
    // reading were identical, the player's only question would remain "did I
    // check the timetable", which is what the review called a timer with extra
    // steps.
    const distinct = new Set(live.map((v) => v.toFixed(2)));
    expect(distinct.size).toBeGreaterThan(2);

    // And it must actually reach a dangerous level sometimes, or there is no
    // threat to read at all.
    expect(Math.max(...values)).toBeGreaterThan(0.5);
  });

  it('rises and falls rather than switching on and off', () => {
    // Sample his approach to the aisle: exposure should climb through
    // intermediate values rather than jumping from nothing to everything.
    const window: number[] = [];
    for (let minute = 40; minute <= 100; minute++) window.push(sample(minute));

    const rising = window.filter((v, i) => i > 0 && v > window[i - 1]! && window[i - 1]! > 0);
    expect(rising.length).toBeGreaterThan(0);
  });
});

describe('the bathroom is nobody’s jurisdiction', () => {
  it('is unwatched by the boss all day, which is what makes it the expensive safe lane', () => {
    for (let minute = 0; minute <= 480; minute += 5) {
      const pose = poseAt(plan, 'dale', minute, createPose());
      if (!pose.visible) continue;
      const look = lookAt(
        opacity,
        {
          id: 'dale',
          x: Math.round(pose.x),
          y: Math.round(pose.y),
          facing: pose.facing,
          attention: 1,
          reports: true,
        },
        PLACES.bathroom.x,
        PLACES.bathroom.y,
        false,
      );
      expect(look.body).toBe(0);
    }
  });
});

describe('roster sanity', () => {
  it('gives every actor a facing the sight model understands', () => {
    for (const def of Object.values(ROSTER)) {
      expect(['up', 'down', 'left', 'right']).toContain(def.restFacing);
    }
  });
});
