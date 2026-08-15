import { describe, expect, it } from 'vitest';
import { BALANCE } from '../config/balance';
import {
  beginDay,
  commitDayAdvance,
  copyStats,
  createRunState,
  isLastDayOfWeek,
  makeDayRecord,
  requestEndOfDay,
  weekOf,
  weekdayOf,
} from './DayState';

const record = (dayIndex: number) => ({
  dayIndex,
  weekday: weekdayOf(dayIndex),
  distanceFt: 100,
  roomsEntered: 3,
  objectsExamined: 2,
});

describe('week arithmetic', () => {
  it('maps day indices onto a Mon-Fri week with no weekend index', () => {
    // Asserted against the balance key, not a literal 5.
    const perWeek = BALANCE.week.daysPerWeek;
    for (let day = 0; day < perWeek * 3; day++) {
      expect(weekdayOf(day)).toBeLessThan(perWeek);
      expect(weekOf(day)).toBe(Math.floor(day / perWeek) + 1);
    }
    expect(weekdayOf(0)).toBe(0);
    expect(isLastDayOfWeek(BALANCE.week.reviewDayIndex)).toBe(true);
    expect(isLastDayOfWeek(BALANCE.week.reviewDayIndex + 1)).toBe(false);
    // The day after Friday is the next Monday.
    expect(weekdayOf(perWeek)).toBe(0);
    expect(weekOf(perWeek)).toBe(2);
  });
});

describe('requestEndOfDay', () => {
  it('is the re-entrancy guard: only the first call wins', () => {
    const state = createRunState(1);
    beginDay(state);

    expect(requestEndOfDay(state)).toBe(true);
    // Phaser's deferred scene queue guarantees more frames after the decision.
    expect(requestEndOfDay(state)).toBe(false);
    expect(requestEndOfDay(state)).toBe(false);
    expect(state.phase).toBe('ending');
  });

  it('refuses when the day is not running', () => {
    const state = createRunState(1);
    expect(state.phase).not.toBe('working');
    expect(requestEndOfDay(state)).toBe(false);
  });
});

describe('commitDayAdvance', () => {
  it('advances atomically, leaving a coherent morning', () => {
    const state = createRunState(1);
    beginDay(state);
    state.stats.distancePx = 500;
    state.stats.roomsEntered.push('Break room');

    commitDayAdvance(state, record(0));

    expect(state.dayIndex).toBe(1);
    expect(state.openDay).toBeNull();
    expect(state.phase).toBe('advancing');
    expect(state.week).toHaveLength(1);
    // No half-advanced state a save flush could capture.
    expect(state.stats.distancePx).toBe(0);
    expect(state.stats.roomsEntered).toHaveLength(0);
  });

  it('clears the week exactly on the rollover boundary', () => {
    const state = createRunState(1);
    const perWeek = BALANCE.week.daysPerWeek;

    for (let day = 0; day < perWeek - 1; day++) {
      beginDay(state);
      commitDayAdvance(state, record(day));
      expect(state.week).toHaveLength(day + 1);
    }

    // Committing Friday clears the week — not a day early, not a day late.
    beginDay(state);
    commitDayAdvance(state, record(perWeek - 1));
    expect(state.week).toHaveLength(0);
    expect(state.dayIndex).toBe(perWeek);
    expect(weekdayOf(state.dayIndex)).toBe(0);
  });
});

describe('copyStats', () => {
  it('deep copies, because the live stats are reset while the summary is up', () => {
    const state = createRunState(1);
    state.stats.roomsEntered.push('Break room');
    const snapshot = copyStats(state.stats);

    commitDayAdvance(state, record(0));

    // A shallow copy would share the array and the Friday card would read zero.
    expect(snapshot.roomsEntered).toEqual(['Break room']);
    expect(state.stats.roomsEntered).toHaveLength(0);
  });
});

describe('makeDayRecord', () => {
  it('converts pixels walked into feet of carpet', () => {
    const state = createRunState(1);
    state.stats.distancePx = 32 * 10; // ten tiles
    const built = makeDayRecord(state, state.stats, 3, 32);
    expect(built.distanceFt).toBe(30);
    expect(built.dayIndex).toBe(0);
    expect(built.weekday).toBe(0);
  });
});
