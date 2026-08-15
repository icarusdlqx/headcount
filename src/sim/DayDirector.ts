import Phaser from 'phaser';
import { BALANCE } from '../config/balance';
import { deriveRng, type Rng } from '../util/rng';
import { FLAGS } from '../util/flags';
import type { NoticeKey, SaveService } from '../save/SaveService';
import { DayClock } from './DayClock';
import { PauseStack, type PauseReason } from './PauseStack';
import { DAY_EVENTS, type DayEndInfo, type DayStartInfo } from './events';
import {
  beginDay as beginDayState,
  commitDayAdvance,
  copyStats,
  isLastDayOfWeek,
  makeDayRecord,
  requestEndOfDay,
  weekOf,
  weekdayOf,
  type DayStats,
  type RunState,
} from './DayState';

/**
 * The composition root: clock + run state + pause stack + event emitter.
 *
 * It owns the CLOCK LIFECYCLE, which DayState deliberately cannot — DayState is
 * pure and knows nothing about the clock, so a day advanced through the pure
 * function alone would leave the clock parked past five o'clock and day two would
 * never tick. Game code calls director.beginDay(), never the pure beginDay().
 *
 * This is the only file in src/sim that imports Phaser, and only for its emitter.
 */
export class DayDirector {
  readonly events = new Phaser.Events.EventEmitter();
  readonly pause = new PauseStack();
  readonly clock: DayClock;

  private readonly run: RunState;
  private readonly save: SaveService;

  constructor(state: RunState, save: SaveService) {
    this.run = state;
    this.save = save;
    this.clock = new DayClock((minute) => this.events.emit(DAY_EVENTS.MINUTE, minute));
  }

  get state(): Readonly<RunState> {
    return this.run;
  }

  /** Mutable stats, for the note* helpers and nothing else. */
  get stats(): DayStats {
    return this.run.stats;
  }

  get minute(): number {
    return this.clock.minute;
  }

  get minutesFloat(): number {
    return this.clock.minutesFloat;
  }

  get progress01(): number {
    return this.clock.progress01;
  }

  get weekday(): number {
    return weekdayOf(this.run.dayIndex);
  }

  get week(): number {
    return weekOf(this.run.dayIndex);
  }

  /** The single mutation point for in-game time in the entire game. */
  tick(deltaMs: number): void {
    if (!this.pause.running) return;
    this.clock.tick(deltaMs, this.timeScale);
  }

  /** ?timescale=N under ?debug=1, otherwise 1. Multiplies clock accumulation
   *  only, so a week can be burned in two minutes without touching physics. */
  private get timeScale(): number {
    return FLAGS.timeScale;
  }

  hold(reason: PauseReason): void {
    if (this.pause.hold(reason)) this.events.emit(DAY_EVENTS.CLOCK_HELD, reason);
  }

  release(reason: PauseReason): void {
    if (this.pause.release(reason)) this.events.emit(DAY_EVENTS.CLOCK_RELEASED, reason);
  }

  /** A fresh independent stream. See deriveRng for why this is never cached. */
  rng(channel: string): Rng {
    return deriveRng(this.run.runSeed, channel);
  }

  /** Boot-time persistence notices, as content keys. Drained once. */
  takeNotices(): NoticeKey[] {
    return this.save.takeNotices();
  }

  /** For the dev readout and the dev-only wipe helper. */
  get saveService(): SaveService {
    return this.save;
  }

  // --- day boundary ------------------------------------------------------

  /**
   * Enter a working day: reset the clock, then the pure state transition, then
   * announce it. Cold boot and every subsequent morning both come through here.
   */
  beginDay(now: number): void {
    this.clock.reset();
    beginDayState(this.run);
    this.save.beginDay(now);

    const info: DayStartInfo = {
      dayIndex: this.run.dayIndex,
      weekday: this.weekday,
      week: this.week,
    };
    this.events.emit(DAY_EVENTS.DAY_START, info);
  }

  /**
   * Five o'clock. Returns the payload for the summary, or null if the day was
   * already ending — the guard that stops two summaries, two increments and two
   * saves when Phaser's deferred scene queue gives us another frame.
   */
  endDay(): DayEndInfo | null {
    if (!requestEndOfDay(this.run)) return null;

    const lastOfWeek = isLastDayOfWeek(this.run.dayIndex);
    const info: DayEndInfo = {
      dayIndex: this.run.dayIndex,
      weekday: this.weekday,
      week: this.week,
      lastOfWeek,
      // Deep copy: commitDayAdvance resets the live stats while this payload is
      // still on screen behind the dialog.
      stats: copyStats(this.run.stats),
      weekSoFar: this.run.week.length + 1,
    };

    this.events.emit(DAY_EVENTS.DAY_END, info);
    if (lastOfWeek) this.events.emit(DAY_EVENTS.WEEK_END, info);
    return info;
  }

  /** Commit the finished day. Atomic, then persisted, then announced. */
  advanceDay(now: number): void {
    const record = makeDayRecord(this.run, this.run.stats, BALANCE.dayEnd.feetPerTile, BALANCE.view.tileSize);
    commitDayAdvance(this.run, record);
    this.save.commitDay(now);
    this.events.emit(DAY_EVENTS.DAY_ADVANCED, this.run);
  }

  /**
   * The ?debug=1 L key, and later M3's "you were sent home". Drives the real
   * clock rather than jumping it, so every MINUTE listener still sees a
   * contiguous run of minutes and nothing downstream can tell the difference.
   * Testing a 330-second day twenty times is otherwise an afternoon.
   */
  endDayNow(): void {
    if (this.run.phase !== 'working') return;
    let guard = 0;
    while (!this.clock.isOver && guard++ < 1000) {
      this.clock.tick(BALANCE.clock.maxTickDeltaMs, 1000);
    }
  }

  // --- day stats ---------------------------------------------------------

  noteRoom(room: string): void {
    if (!this.run.stats.roomsEntered.includes(room)) this.run.stats.roomsEntered.push(room);
  }

  noteExamined(): void {
    this.run.stats.objectsExamined += 1;
  }

  /** Called with the body's own speed, so it allocates nothing and is
   *  automatically correct when the player is frozen. */
  noteMovement(speedPxPerSec: number, deltaMs: number): void {
    const stats = this.run.stats;
    if (speedPxPerSec > 1) {
      stats.distancePx += (speedPxPerSec * deltaMs) / 1000;
      stats.stationaryRunMs = 0;
      return;
    }
    stats.stationaryRunMs += deltaMs;
    if (stats.stationaryRunMs > stats.longestStationaryMs) {
      stats.longestStationaryMs = stats.stationaryRunMs;
    }
  }
}

const REGISTRY_KEY = 'dayDirector';

export function installDirector(game: Phaser.Game, director: DayDirector): void {
  game.registry.set(REGISTRY_KEY, director);
}

/** Throws loudly rather than returning undefined, matching the tileset check. */
export function getDirector(scene: Phaser.Scene): DayDirector {
  const director = scene.game.registry.get(REGISTRY_KEY) as DayDirector | undefined;
  if (!director) throw new Error('DayDirector missing from the registry — BootScene must install it');
  return director;
}
