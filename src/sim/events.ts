import type { DayStats } from './DayState';
import type { PauseReason } from './PauseStack';

/**
 * The events other systems subscribe to.
 *
 * All emitted on DayDirector.events — a plain emitter owned by the director, not
 * by a scene, so listeners still fire while their owning scene is paused.
 *
 * THE CONSUMER RULE: push discrete, pull continuous. Anything that happens at a
 * moment subscribes to MINUTE. Anything that varies smoothly (M3's stress drain,
 * an M4 NPC lerp) reads director.minutesFloat in its own update. There is
 * deliberately no per-frame clock event.
 */
export const DAY_EVENTS = {
  /** (minute: number) 1..480. Discrete, contiguous, ordered. All RNG draws hang off this. */
  MINUTE: 'day:minute',
  /** (info: DayStartInfo) 9:00 AM, after the morning fade completes. */
  DAY_START: 'day:start',
  /** (info: DayEndInfo) 5:00 PM, before the summary appears. */
  DAY_END: 'day:end',
  /** (info: DayEndInfo) After DAY_END on the last workday of a week. M7 scores here. */
  WEEK_END: 'week:end',
  /** (state: RunState) dayIndex has already incremented. The morning-reset trigger. */
  DAY_ADVANCED: 'day:advanced',
  /** (reason: PauseReason) Fired on the 0 -> 1 transition only. */
  CLOCK_HELD: 'clock:held',
  /** (reason: PauseReason) Fired on the 1 -> 0 transition only. */
  CLOCK_RELEASED: 'clock:released',
} as const;

export interface DayStartInfo {
  readonly dayIndex: number;
  readonly weekday: number;
  readonly week: number;
}

export interface DayEndInfo {
  readonly dayIndex: number;
  readonly weekday: number;
  readonly week: number;
  readonly lastOfWeek: boolean;
  /** A deep copy — the live stats are reset while this is still on screen. */
  readonly stats: Readonly<DayStats>;
  /** Committed days in the week, including today. */
  readonly weekSoFar: number;
}

export type ClockHeldPayload = PauseReason;
