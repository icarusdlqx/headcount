import { BALANCE } from '../config/balance';

/**
 * The workday clock: a fixed-timestep accumulator.
 *
 * It eats real milliseconds and emits exactly one discrete in-game minute per
 * MS_PER_GAME_MINUTE consumed, so a day is always MINUTES_PER_DAY minute-events
 * regardless of frame rate. It also exposes a continuous float.
 *
 * THE RULE: state changes and RNG draws hang off the discrete minute. Only
 * presentation and interpolation may read the float. A per-frame rng.chance()
 * makes a 144Hz machine play a different day from a 60Hz one — invisible in a
 * playtest on one laptop, and unfixable by seed afterwards.
 *
 * Pure: no Phaser, no DOM, no wall clock.
 */

/** (17 - 9) * 60 === 480. Derived, never a literal. */
export const MINUTES_PER_DAY: number = (BALANCE.clock.endHour - BALANCE.clock.startHour) * 60;

/** 330000 / 480 === 687.5 real ms per in-game minute. */
export const MS_PER_GAME_MINUTE: number = (BALANCE.clock.realSecondsPerDay * 1000) / MINUTES_PER_DAY;

/**
 * Shouts at boot on a designer typo, the same posture as buildTileGrid() throwing
 * on a ragged map row. A negative-length workday should not be a silent freeze.
 */
export function assertClockBalance(): void {
  if (!Number.isFinite(MINUTES_PER_DAY) || MINUTES_PER_DAY <= 0) {
    throw new Error(`balance.clock: endHour must be after startHour (got ${MINUTES_PER_DAY} minutes)`);
  }
  if (!Number.isFinite(MS_PER_GAME_MINUTE) || MS_PER_GAME_MINUTE <= 0) {
    throw new Error(`balance.clock: realSecondsPerDay must be positive (got ${BALANCE.clock.realSecondsPerDay})`);
  }
  if (BALANCE.clock.displayMinuteStep < 1 || MINUTES_PER_DAY % BALANCE.clock.displayMinuteStep !== 0) {
    // If the step does not divide the day, the clock never displays 5:00 PM.
    throw new Error(
      `balance.clock: displayMinuteStep ${BALANCE.clock.displayMinuteStep} must divide ${MINUTES_PER_DAY}`,
    );
  }
}

export class DayClock {
  private accumulatorMs = 0;
  private currentMinute = 0;
  private realMs = 0;

  constructor(private readonly onMinute: (minute: number) => void) {}

  /** Whole in-game minutes elapsed, 0..MINUTES_PER_DAY. The authoritative time. */
  get minute(): number {
    return this.currentMinute;
  }

  /** minute + fraction. Interpolation and presentation ONLY. Never RNG. */
  get minutesFloat(): number {
    if (this.currentMinute >= MINUTES_PER_DAY) return MINUTES_PER_DAY;
    return this.currentMinute + this.accumulatorMs / MS_PER_GAME_MINUTE;
  }

  /** 0..1 through the workday, for anything that wants to lerp across it. */
  get progress01(): number {
    return this.minutesFloat / MINUTES_PER_DAY;
  }

  get isOver(): boolean {
    return this.currentMinute >= MINUTES_PER_DAY;
  }

  /** Quantised for the status bar, so the compression ratio stays illegible. */
  get displayMinute(): number {
    const step = BALANCE.clock.displayMinuteStep;
    return Math.floor(this.currentMinute / step) * step;
  }

  /** Pause-aware real ms consumed today. Diagnostics only. */
  get elapsedRealMs(): number {
    return this.realMs;
  }

  /**
   * Advance by one frame's worth of real time. The only mutation point.
   *
   * `timeScale` multiplies accumulation only, so ?timescale=12 burns a week in
   * two minutes without touching physics, tweens, or the number of simulation
   * ticks that occur.
   */
  tick(deltaMs: number, timeScale = 1): void {
    if (this.isOver) return;
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;

    const clamped = Math.min(deltaMs, BALANCE.clock.maxTickDeltaMs) * timeScale;
    this.realMs += clamped;
    this.accumulatorMs += clamped;

    let ticks = 0;
    while (this.accumulatorMs >= MS_PER_GAME_MINUTE && !this.isOver) {
      if (ticks >= BALANCE.clock.maxTicksPerFrame) {
        // Drop the backlog rather than spiral. Better to lose a moment of game
        // time than to freeze the tab catching up on it.
        this.accumulatorMs = 0;
        break;
      }
      this.accumulatorMs -= MS_PER_GAME_MINUTE;
      this.currentMinute += 1;
      ticks += 1;
      this.onMinute(this.currentMinute);
    }

    // Never bank time past five o'clock; it would leak into tomorrow morning.
    if (this.isOver) this.accumulatorMs = 0;
  }

  /**
   * Back to 9:00 AM. Called by DayDirector.beginDay() — without it, tick()
   * no-ops forever after the first day and day 2 never advances.
   */
  reset(): void {
    this.accumulatorMs = 0;
    this.currentMinute = 0;
    this.realMs = 0;
  }
}
