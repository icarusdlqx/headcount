import { describe, expect, it } from 'vitest';
import { BALANCE } from '../config/balance';
import { ROOMS } from '../world/officeMap';
import {
  DESK_AT_REST,
  METER,
  adjustMeter,
  applyOvernight,
  assertVisibilityCoverage,
  clampMeter,
  resetDailyMeters,
  sanitiseMeters,
  stepMinute,
  stressTier,
  visibilityTarget,
  type PresenceSample,
} from './meters';

const sample = (over: Partial<PresenceSample> = {}): PresenceSample => ({ ...DESK_AT_REST, ...over });

function freshMeters(): Record<string, number> {
  const m: Record<string, number> = {};
  sanitiseMeters(m);
  return m;
}

describe('visibility', () => {
  it('covers every room in the map', () => {
    // A room with no exposure value silently falls back, which would move every
    // Boss Approval rate in the game without a single warning.
    expect(assertVisibilityCoverage(ROOMS)).toEqual([]);
  });

  it('reads lowest at your own desk and highest on the move in the open', () => {
    const desk = visibilityTarget(DESK_AT_REST);
    const corridor = visibilityTarget(sample({ room: 'The corridor', atOwnDesk: false, moving: true }));
    const bathroom = visibilityTarget(sample({ room: 'Bathroom', atOwnDesk: false }));

    expect(desk).toBeLessThan(corridor);
    expect(bathroom).toBeLessThan(desk);
  });

  it('never leaves the meter range', () => {
    const loud = visibilityTarget(
      sample({ room: "Boss's office", atOwnDesk: false, moving: true, purposeful: true, speakerToday: true }),
    );
    expect(loud).toBeLessThanOrEqual(BALANCE.meters.max);
    expect(loud).toBeGreaterThanOrEqual(BALANCE.meters.min);
  });
});

describe('stepMinute', () => {
  it('raises Boss Approval at your desk and lowers it away from it', () => {
    const atDesk = freshMeters();
    const away = freshMeters();
    for (let i = 0; i < 120; i++) {
      stepMinute(atDesk, DESK_AT_REST);
      stepMinute(away, sample({ room: 'Break room', posture: 'elsewhere', atOwnDesk: false }));
    }
    expect(atDesk[METER.bossApproval]!).toBeGreaterThan(BALANCE.meters.startBossApproval);
    expect(away[METER.bossApproval]!).toBeLessThan(BALANCE.meters.startBossApproval);
  });

  it('never lets exposure be free — being seen costs stress as well', () => {
    // The exploit this closes: holding Shift and wiggling on your own desk tile
    // raised Boss Approval with no cost on any other meter, which is exactly the
    // input-jiggling dominance the design rule forbids.
    const still = freshMeters();
    const jiggling = freshMeters();
    for (let i = 0; i < 120; i++) {
      stepMinute(still, DESK_AT_REST);
      stepMinute(jiggling, sample({ moving: true, purposeful: true }));
    }

    expect(jiggling[METER.bossApproval]!).toBeGreaterThan(still[METER.bossApproval]!);
    // ...but it is bought with strain, so it is a trade rather than free money.
    expect(jiggling[METER.stress]!).toBeGreaterThan(still[METER.stress]!);
  });

  it('leaves Coworker Rep alone — it moves only on discrete events', () => {
    const meters = freshMeters();
    const before = meters[METER.coworkerRep]!;
    for (let i = 0; i < 480; i++) stepMinute(meters, DESK_AT_REST);
    expect(meters[METER.coworkerRep]).toBe(before);
  });

  it('does not drift while you are mid-fax', () => {
    const meters = freshMeters();
    const before = meters[METER.bossApproval]!;
    for (let i = 0; i < 60; i++) stepMinute(meters, sample({ posture: 'busy' }));
    expect(meters[METER.bossApproval]).toBe(before);
  });
});

describe('overnight', () => {
  it('pulls toward the baseline without ever overshooting it', () => {
    const meters = freshMeters();
    meters[METER.bossApproval] = 90;
    meters[METER.stress] = 95;

    for (let night = 0; night < 20; night++) applyOvernight(meters, true);

    // A rate over 1 would invert the meter: a Friday of 90 returning as a
    // Monday of 10. It must converge, never cross.
    expect(meters[METER.bossApproval]!).toBeGreaterThanOrEqual(BALANCE.meters.startBossApproval - 0.001);
    expect(meters[METER.stress]!).toBeGreaterThanOrEqual(BALANCE.meters.startStress - 0.001);
  });

  it('forgets more over a weekend than overnight', () => {
    const weeknight = freshMeters();
    const weekend = freshMeters();
    weeknight[METER.bossApproval] = 90;
    weekend[METER.bossApproval] = 90;

    applyOvernight(weeknight, false);
    applyOvernight(weekend, true);
    expect(weekend[METER.bossApproval]!).toBeLessThan(weeknight[METER.bossApproval]!);
  });
});

describe('daily reset', () => {
  it('clears Productivity and reseeds Visibility, leaving reputations alone', () => {
    const meters = freshMeters();
    meters[METER.productivity] = 80;
    meters[METER.bossApproval] = 70;
    meters[METER.visibility] = 99;

    resetDailyMeters(meters);

    expect(meters[METER.productivity]).toBe(BALANCE.meters.startProductivity);
    expect(meters[METER.visibility]).toBe(visibilityTarget(DESK_AT_REST));
    expect(meters[METER.bossApproval]).toBe(70);
  });
});

describe('clamping and repair', () => {
  it('reports the delta actually applied at a bound', () => {
    const meters = freshMeters();
    meters[METER.stress] = 98;
    expect(adjustMeter(meters, METER.stress, 10)).toBe(2);
    expect(meters[METER.stress]).toBe(BALANCE.meters.max);
  });

  it('repairs a hand-edited save rather than propagating NaN', () => {
    const meters: Record<string, number> = {
      productivity: Number.NaN,
      bossApproval: 1e9,
      coworkerRep: -400,
      stress: Number.POSITIVE_INFINITY,
    };
    sanitiseMeters(meters);

    expect(meters[METER.productivity]).toBe(BALANCE.meters.startProductivity);
    expect(meters[METER.bossApproval]).toBe(BALANCE.meters.max);
    expect(meters[METER.coworkerRep]).toBe(BALANCE.meters.min);
    expect(meters[METER.stress]).toBe(BALANCE.meters.startStress);
    expect(clampMeter(Number.NaN)).toBe(BALANCE.meters.min);
  });
});

describe('stress tiers', () => {
  it('escalates at the balance thresholds and never past tier 3', () => {
    expect(stressTier(0)).toBe(0);
    expect(stressTier(BALANCE.stress.jitterAt)).toBe(1);
    expect(stressTier(BALANCE.stress.blurAt)).toBe(2);
    expect(stressTier(BALANCE.stress.transposeAt)).toBe(3);
    expect(stressTier(100)).toBe(3);
  });
});
