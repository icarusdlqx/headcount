import { BALANCE } from '../config/balance';

/**
 * The one mutable run state, and every guarded transition on it.
 * Pure: no Phaser, no DOM, no storage.
 */

export type DayPhase = 'working' | 'ending' | 'summary' | 'weekend' | 'advancing';

/** Per-day, transient. NEVER persisted. Reset in place by resetStats(). */
export interface DayStats {
  distancePx: number;
  /** Insertion-ordered and deduped. One entry per room actually entered. */
  roomsEntered: string[];
  objectsExamined: number;
  longestStationaryMs: number;
  stationaryRunMs: number;
}

/** One committed workday. Feeds the Friday review in M7. */
export interface DayRecord {
  dayIndex: number;
  weekday: number;
  distanceFt: number;
  roomsEntered: number;
  objectsExamined: number;
}

export interface RunState {
  runSeed: number;
  /** Counts WORKDAYS ONLY. 0 = the first Monday. Weekends consume no index. */
  dayIndex: number;
  /** Non-null while a day is in progress but uncommitted. */
  openDay: number | null;
  daysAbandoned: number;
  phase: DayPhase;
  stats: DayStats;
  /** Committed days in the current week. Cleared on week rollover. */
  week: DayRecord[];
  /** Open record — M3's meters land here with no schema change. */
  meters: Record<string, number>;
  /** Open record — the pressure valve. M4's favor becomes flags['favor.steve']. */
  flags: Record<string, number>;
  /** M3's fax-sequence mastery. Deduped and sorted on write. */
  learned: string[];
}

export function createDayStats(): DayStats {
  return {
    distancePx: 0,
    roomsEntered: [],
    objectsExamined: 0,
    longestStationaryMs: 0,
    stationaryRunMs: 0,
  };
}

/** Mutates in place — this runs at a day boundary, not in a hot loop, but the
 *  stats object is referenced by the director and must not be swapped out. */
export function resetStats(stats: DayStats): void {
  stats.distancePx = 0;
  stats.roomsEntered.length = 0;
  stats.objectsExamined = 0;
  stats.longestStationaryMs = 0;
  stats.stationaryRunMs = 0;
}

/** A defensive DEEP copy. The live stats are reset mid-transition, while the
 *  summary dialog is still reading them. A shallow copy shares roomsEntered and
 *  the Friday card ends up reporting zero rooms. */
export function copyStats(stats: DayStats): DayStats {
  return {
    distancePx: stats.distancePx,
    roomsEntered: stats.roomsEntered.slice(),
    objectsExamined: stats.objectsExamined,
    longestStationaryMs: stats.longestStationaryMs,
    stationaryRunMs: stats.stationaryRunMs,
  };
}

export function createRunState(runSeed: number): RunState {
  return {
    runSeed,
    dayIndex: 0,
    openDay: null,
    daysAbandoned: 0,
    // Never 'working'. The working state is only ever entered through beginDay(),
    // which is what guarantees the clock was reset first.
    phase: 'advancing',
    stats: createDayStats(),
    week: [],
    meters: {
      productivity: BALANCE.meters.startProductivity,
      bossApproval: BALANCE.meters.startBossApproval,
      coworkerRep: BALANCE.meters.startCoworkerRep,
      stress: BALANCE.meters.startStress,
    },
    flags: {},
    learned: [],
  };
}

/** 0 = Monday. */
export function weekdayOf(dayIndex: number): number {
  return dayIndex % BALANCE.week.daysPerWeek;
}

/** 1-based, for display. */
export function weekOf(dayIndex: number): number {
  return Math.floor(dayIndex / BALANCE.week.daysPerWeek) + 1;
}

export function isLastDayOfWeek(dayIndex: number): boolean {
  return weekdayOf(dayIndex) === BALANCE.week.reviewDayIndex;
}

/**
 * The single re-entrancy guard for ending a day.
 *
 * Scene pause and scene launch both go through Phaser's deferred queue, so
 * update() runs at least once more after the decision is made. Without this,
 * you get two day increments, two summaries and two saves.
 */
export function requestEndOfDay(state: RunState): boolean {
  if (state.phase !== 'working') return false;
  state.phase = 'ending';
  return true;
}

/**
 * Atomic. Pushes the record, increments the day, clears the week on rollover,
 * resets stats. There is deliberately no observable half-advanced state — a
 * save flushed mid-transition must never describe "Tuesday at 5:00 PM".
 */
export function commitDayAdvance(state: RunState, record: DayRecord): void {
  const rolledOver = isLastDayOfWeek(state.dayIndex);

  state.week.push(record);
  if (state.week.length > BALANCE.save.maxWeekRecords) {
    state.week.splice(0, state.week.length - BALANCE.save.maxWeekRecords);
  }

  state.dayIndex = Math.min(state.dayIndex + 1, BALANCE.save.maxDayIndex);
  state.openDay = null;
  if (rolledOver) state.week.length = 0;
  resetStats(state.stats);
  state.phase = 'advancing';
}

/** Enter the working day. Call DayDirector.beginDay(), not this, from game code:
 *  the director also resets the clock, and a day without that never advances. */
export function beginDay(state: RunState): void {
  state.phase = 'working';
  state.openDay = state.dayIndex;
}

/** Build the record for the day about to be committed. */
export function makeDayRecord(state: RunState, stats: DayStats, feetPerTile: number, tileSize: number): DayRecord {
  return {
    dayIndex: state.dayIndex,
    weekday: weekdayOf(state.dayIndex),
    distanceFt: Math.round((stats.distancePx / tileSize) * feetPerTile),
    roomsEntered: stats.roomsEntered.length,
    objectsExamined: stats.objectsExamined,
  };
}
