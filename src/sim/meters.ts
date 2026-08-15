import { BALANCE } from '../config/balance';
import { PLACES, roomAt } from '../world/officeMap';

/**
 * The five meters, and every rule that moves them passively.
 * Pure: no Phaser, no DOM, no storage.
 */

export const METER = {
  productivity: 'productivity',
  bossApproval: 'bossApproval',
  coworkerRep: 'coworkerRep',
  stress: 'stress',
  visibility: 'visibility',
} as const;

export type MeterKey = (typeof METER)[keyof typeof METER];

export const METER_KEYS: readonly MeterKey[] = [
  METER.productivity,
  METER.bossApproval,
  METER.coworkerRep,
  METER.stress,
  METER.visibility,
];

/**
 * Never written to a save blob. Visibility is a reading about *now*, and the
 * inputs that produce it (where you are standing) are deliberately not persisted,
 * so persisting the output would be a lie about what the number means.
 */
export const TRANSIENT_METERS: ReadonlySet<string> = new Set<string>([METER.visibility]);

/** Reset to a fresh value every morning by the day loop. */
export const DAILY_METERS: readonly MeterKey[] = [METER.productivity, METER.visibility];

/**
 * Where the player is and what they are doing, as the meters see it.
 *
 * tileX/tileY are carried but UNUSED at M3. They are here because M5 replaces
 * visibilityTarget's body with a line-of-sight raycast, which needs coordinates —
 * a sample carrying only a room name is the one shape that cannot become
 * line-of-sight without changing every caller and every test fixture.
 */
export interface PresenceSample {
  room: string;
  posture: Posture;
  moving: boolean;
  purposeful: boolean;
  atOwnDesk: boolean;
  speakerToday: boolean;
  tileX: number;
  tileY: number;
}

export type Posture = 'desk' | 'busy' | 'elsewhere';

/** Room exposure is keyed by the ROOMS[].name strings, which are already declared
 *  as data keys. Read through a typed local: indexing an `as const` object with a
 *  plain string is a strict-mode error, and this also hoists the lookup. */
const EXPOSURE = BALANCE.visibility.roomExposure as Record<string, number>;

/**
 * What "at your desk, doing nothing" reads. One source of truth for the morning
 * Visibility value. The room is derived from the actual spawn tile rather than
 * written as a literal, so renaming a room in officeMap.ts cannot silently drop
 * this through to the fallback exposure.
 */
export const DESK_AT_REST: Readonly<PresenceSample> = Object.freeze({
  room: roomAt(PLACES.playerCubicle.x, PLACES.playerCubicle.y, ''),
  posture: 'desk' as Posture,
  moving: false,
  purposeful: false,
  atOwnDesk: true,
  speakerToday: false,
  tileX: PLACES.playerCubicle.x,
  tileY: PLACES.playerCubicle.y,
});

export function clampMeter(value: number): number {
  if (!Number.isFinite(value)) return BALANCE.meters.min;
  return Math.min(BALANCE.meters.max, Math.max(BALANCE.meters.min, value));
}

/** Clamps, writes, and returns the delta that was actually APPLIED — which is
 *  smaller than requested at a bound, and is what the HUD should report. */
export function adjustMeter(meters: Record<string, number>, key: MeterKey, delta: number): number {
  const before = meters[key] ?? 0;
  const after = clampMeter(before + delta);
  meters[key] = after;
  return after - before;
}

export function setMeter(meters: Record<string, number>, key: MeterKey, value: number): void {
  meters[key] = clampMeter(value);
}

/** Repairs a hand-edited or foreign save: every known meter finite and in range. */
export function sanitiseMeters(meters: Record<string, number>): void {
  const starts: Record<MeterKey, number> = {
    productivity: BALANCE.meters.startProductivity,
    bossApproval: BALANCE.meters.startBossApproval,
    coworkerRep: BALANCE.meters.startCoworkerRep,
    stress: BALANCE.meters.startStress,
    visibility: visibilityTarget(DESK_AT_REST),
  };
  for (const key of METER_KEYS) {
    const value = meters[key];
    meters[key] = typeof value === 'number' && Number.isFinite(value) ? clampMeter(value) : starts[key];
  }
}

/**
 * THE M5 SEAM. M5 replaces this body with a line-of-sight raycast against the
 * boss and the snitch NPCs, using the tile coordinates already on the sample.
 * Nothing else in this file moves, and the sentence that describes the meter does
 * not change: "how much of the floor can see you right now".
 */
export function visibilityTarget(sample: Readonly<PresenceSample>): number {
  let v = EXPOSURE[sample.room] ?? BALANCE.visibility.fallbackExposure;
  // Your body is behind a partition. Deliberately not modelling the monitor
  // facing the aisle — that is SCREEN exposure, a separate M5 concern.
  if (sample.atOwnDesk) v += BALANCE.visibility.ownDeskDelta;
  if (sample.posture === 'busy') v += BALANCE.visibility.busyDelta;
  if (sample.moving) v += BALANCE.visibility.movingDelta;
  if (sample.moving && sample.purposeful) v += BALANCE.visibility.purposefulDelta;
  if (sample.speakerToday) v += BALANCE.visibility.speakerDelta;
  return clampMeter(v);
}

/**
 * One discrete in-game minute of passive drift.
 *
 * Order is load-bearing: visibility eases FIRST, so the multiplier below reads
 * this minute's exposure rather than last minute's.
 */
export function stepMinute(meters: Record<string, number>, sample: Readonly<PresenceSample>): void {
  const target = visibilityTarget(sample);
  const vis = clampMeter(
    (meters[METER.visibility] ?? target) + (target - (meters[METER.visibility] ?? target)) * BALANCE.visibility.ease,
  );
  meters[METER.visibility] = vis;

  const posture = BALANCE.presence[sample.posture];
  const floor = BALANCE.presence.bossVisibilityFloor;
  const visMult = floor + (1 - floor) * (vis / BALANCE.meters.max);

  const boss = meters[METER.bossApproval] ?? BALANCE.meters.startBossApproval;
  meters[METER.bossApproval] = clampMeter(boss + (posture.bossTarget - boss) * posture.bossRate * visMult);

  // The multiplier applies to Stress too, so exposure is never free: being seen
  // working buys the Boss gain WITH stress. Without this, holding Shift and
  // wiggling on your own desk tile raised Boss Approval at no cost on any meter,
  // which is exactly the input-jiggling dominance the design rule forbids.
  const stress = meters[METER.stress] ?? BALANCE.meters.startStress;
  meters[METER.stress] = clampMeter(stress + (posture.stressTarget - stress) * posture.stressRate * visMult);

  // Coworker Rep has NO passive drift at M3. It moves only on discrete events,
  // which is what gives it a different character from the other two reputations:
  // management forms an impression by watching, peers by remembering.
}

/**
 * Overnight regression toward the baselines. The boss's memory is short;
 * coworkers remember. The weekend is three nights.
 */
export function applyOvernight(meters: Record<string, number>, weekendNight: boolean): void {
  const m = BALANCE.meters;
  const scale = weekendNight ? m.weekendRegressMultiplier : 1;
  const rate = (base: number): number => Math.min(m.maxOvernightRegressRate, base * scale);

  const ease = (key: MeterKey, baseline: number, base: number): void => {
    const value = meters[key] ?? baseline;
    meters[key] = clampMeter(value + (baseline - value) * rate(base));
  };

  ease(METER.bossApproval, m.startBossApproval, m.overnightBossRegress);
  ease(METER.coworkerRep, m.startCoworkerRep, m.overnightCoworkerRegress);
  ease(METER.stress, m.startStress, m.overnightStressRegress);
}

/** The morning: Productivity is a fresh daily quantity, Visibility a fresh reading. */
export function resetDailyMeters(meters: Record<string, number>): void {
  setMeter(meters, METER.productivity, BALANCE.meters.startProductivity);
  setMeter(meters, METER.visibility, visibilityTarget(DESK_AT_REST));
}

/** Comedic degradation tier. Never a hard fail — see faxMachine.ts for what each does. */
export function stressTier(stress: number): 0 | 1 | 2 | 3 {
  if (stress >= BALANCE.stress.transposeAt) return 3;
  if (stress >= BALANCE.stress.blurAt) return 2;
  if (stress >= BALANCE.stress.jitterAt) return 1;
  return 0;
}

/**
 * Dev-only: every room in the map must have an exposure value, or a player
 * standing in it silently gets the fallback. Same posture as the map's
 * unreachable-room check.
 */
export function assertVisibilityCoverage(rooms: readonly { name: string }[]): string[] {
  return rooms.filter((room) => EXPOSURE[room.name] === undefined).map((room) => `visibility.roomExposure missing "${room.name}"`);
}
