import { describe, expect, it } from 'vitest';
import { BALANCE } from '../config/balance';
import { DayClock, MINUTES_PER_DAY, MS_PER_GAME_MINUTE, assertClockBalance } from './DayClock';

/**
 * The clock's contract is a property no playtest can observe: the same number of
 * discrete minutes, in order, whatever the frame rate. If this breaks, a seed
 * stops meaning anything and nobody notices until a bug report can't be replayed.
 */

/**
 * Feed real time in frame-sized chunks. A single big tick() would be clamped to
 * maxTickDeltaMs — which is the clock working correctly, and exactly the trap a
 * test that calls tick(oneMinute) once falls into.
 */
function advance(clock: DayClock, ms: number): void {
  const step = BALANCE.clock.maxTickDeltaMs;
  for (let left = ms; left > 0; left -= step) clock.tick(Math.min(step, left));
}

function runDay(frameMs: number): number[] {
  const seen: number[] = [];
  const clock = new DayClock((minute) => seen.push(minute));
  const frames = Math.ceil((BALANCE.clock.realSecondsPerDay * 1000) / frameMs) + 10;
  for (let i = 0; i < frames && !clock.isOver; i++) clock.tick(frameMs);
  return seen;
}

describe('DayClock', () => {
  it('has a coherent balance configuration', () => {
    expect(() => assertClockBalance()).not.toThrow();
    expect(MINUTES_PER_DAY).toBe(480);
    expect(MS_PER_GAME_MINUTE).toBeCloseTo(687.5, 5);
  });

  it('emits exactly one contiguous run of minutes regardless of frame rate', () => {
    const at60 = runDay(1000 / 60);
    const at25 = runDay(40);
    const at144 = runDay(1000 / 144);

    for (const run of [at60, at25, at144]) {
      expect(run).toHaveLength(MINUTES_PER_DAY);
      expect(run[0]).toBe(1);
      expect(run[run.length - 1]).toBe(MINUTES_PER_DAY);
      // Contiguous and ordered: no gaps, no repeats, no reordering.
      for (let i = 0; i < run.length; i++) expect(run[i]).toBe(i + 1);
    }
  });

  it('clamps a delta spike rather than skipping minutes', () => {
    const seen: number[] = [];
    const clock = new DayClock((m) => seen.push(m));
    clock.tick(5000); // a GC pause or a dragged window
    // Clamped to maxTickDeltaMs, which is well under one game minute.
    expect(BALANCE.clock.maxTickDeltaMs).toBeLessThan(MS_PER_GAME_MINUTE);
    expect(seen.length).toBe(0);
    expect(clock.minute).toBe(0);
  });

  it('drops the backlog rather than spiralling when time is scaled hard', () => {
    const seen: number[] = [];
    const clock = new DayClock((m) => seen.push(m));
    clock.tick(BALANCE.clock.maxTickDeltaMs, 1000);
    expect(seen.length).toBe(BALANCE.clock.maxTicksPerFrame);
    for (let i = 0; i < seen.length; i++) expect(seen[i]).toBe(i + 1);
  });

  it('fires the final minute, then goes inert', () => {
    const seen: number[] = [];
    const clock = new DayClock((m) => seen.push(m));
    for (let i = 0; i < 100000 && !clock.isOver; i++) clock.tick(16.6667);

    expect(clock.isOver).toBe(true);
    expect(seen[seen.length - 1]).toBe(MINUTES_PER_DAY);
    // The HUD must be able to read exactly 5:00 PM under the dialog.
    expect(clock.displayMinute).toBe(MINUTES_PER_DAY);

    const countAtEnd = seen.length;
    clock.tick(16.6667);
    clock.tick(5000);
    expect(seen.length).toBe(countAtEnd);
  });

  it('resets for the next morning — without this, day two never advances', () => {
    const clock = new DayClock(() => {});
    for (let i = 0; i < 100000 && !clock.isOver; i++) clock.tick(16.6667);
    expect(clock.isOver).toBe(true);

    clock.reset();
    expect(clock.minute).toBe(0);
    expect(clock.isOver).toBe(false);
    advance(clock, MS_PER_GAME_MINUTE);
    expect(clock.minute).toBe(1);
  });

  it('quantises the display without quantising the simulation', () => {
    const clock = new DayClock(() => {});
    advance(clock, MS_PER_GAME_MINUTE * 7);
    expect(clock.minute).toBe(7);
    expect(clock.displayMinute).toBe(5);
  });

  it('ignores nonsense deltas', () => {
    const seen: number[] = [];
    const clock = new DayClock((m) => seen.push(m));
    clock.tick(Number.NaN);
    clock.tick(-1000);
    clock.tick(0);
    expect(seen.length).toBe(0);
    expect(clock.minute).toBe(0);
  });
});
