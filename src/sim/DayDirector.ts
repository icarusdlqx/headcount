import Phaser from 'phaser';
import { BALANCE } from '../config/balance';
import { deriveRng, type Rng } from '../util/rng';
import { FLAGS } from '../util/flags';
import type { NoticeKey, SaveService } from '../save/SaveService';
import { DayClock } from './DayClock';
import { PauseStack, type PauseReason } from './PauseStack';
import { DAY_EVENTS, type DayEndInfo, type DayStartInfo } from './events';
import { MINUTES_PER_DAY } from './DayClock';
import {
  METER,
  adjustMeter,
  applyOvernight,
  resetDailyMeters,
  stepMinute,
  stressTier,
  type PresenceSample,
} from './meters';
import { FAX_TOKENS, generatePanel, type FaxOutcome, type FaxPanel } from './faxMachine';
import { Router } from './npcPath';
import { buildDayPlan, type DayPlan } from './npcSchedule';
import { buildTray, faxOutcomeDeltas, foreignJamChance, type FaxJob, type MeterDelta } from './faxTray';
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
/** Where today's Steve situation has got to. Only the grudge outlives the day. */
export type SteveStage = 'none' | 'asked' | 'covered' | 'partial' | 'declined' | 'resolved';

export class DayDirector {
  readonly events = new Phaser.Events.EventEmitter();
  readonly pause = new PauseStack();
  readonly clock: DayClock;

  private readonly run: RunState;
  private readonly save: SaveService;

  private panel: FaxPanel | null = null;
  private jobs: FaxJob[] = [];
  private speakerCharged = false;
  private pendingReplyMinute: number | null = null;
  private lastFaxOutcome: FaxOutcome | null = null;
  private router: Router | null = null;
  private dayPlan: DayPlan = {};
  /** Today's Steve situation. Rebuilt each morning; only the grudge persists. */
  private steveStage: SteveStage = 'none';
  private steveJobId: string | null = null;
  private chargingMinutes = false;

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

  /**
   * The only sanctioned way to charge in-game time from a modal scene: the fax
   * bills per ACTION, so deliberation is free and decisions are not.
   *
   * Clamped one minute short of five o'clock while a modal is held, so a fax can
   * never stack the end-of-day summary on top of a live fax panel. The day ends
   * the moment the panel closes instead — the fax is the one thing that can make
   * you late, and it should be, but it must not do so while you are still in it.
   */
  spendMinutes(count: number): void {
    if (this.run.phase !== 'working') return;
    // Re-entrancy guard. advanceMinutes fires MINUTE events SYNCHRONOUSLY, and
    // anything driven off that hook (M5's fluff machine) would otherwise run
    // inside its own charge — pressing the panic key at dwell 4 would land you
    // at dwell 6 and the panic key would catch you.
    if (this.chargingMinutes) return;
    this.chargingMinutes = true;
    const cap = this.pause.modal ? MINUTES_PER_DAY - 1 : MINUTES_PER_DAY;
    const room = Math.max(0, cap - this.clock.minute);
    try {
      this.clock.advanceMinutes(Math.min(Math.max(0, Math.trunc(count)), room));
    } finally {
      this.chargingMinutes = false;
    }
  }

  // --- meters ------------------------------------------------------------

  get meters(): Record<string, number> {
    return this.run.meters;
  }

  /** One discrete minute of passive drift. Called from the MINUTE hook, never
   *  per frame — a per-frame drift makes 144Hz and 60Hz play different days. */
  stepMeters(sample: Readonly<PresenceSample>): void {
    stepMinute(this.run.meters, sample);
  }

  applyDeltas(deltas: readonly MeterDelta[]): void {
    for (const { key, delta } of deltas) adjustMeter(this.run.meters, key, delta);
  }

  get stressTier(): 0 | 1 | 2 | 3 {
    return stressTier(this.run.meters[METER.stress] ?? 0);
  }

  // --- the fax -----------------------------------------------------------

  /** Generated per RUN, not per day: the machine is the same all week, which is
   *  what makes a learned label still true on Thursday. */
  get faxPanel(): FaxPanel {
    if (!this.panel) this.panel = generatePanel(this.rng('fax:panel:v1'));
    return this.panel;
  }

  get tray(): readonly FaxJob[] {
    return this.jobs;
  }

  /** The next job in the tray, or null when the day's paper is done. */
  get nextJob(): FaxJob | null {
    return this.jobs[0] ?? null;
  }

  get sentToday(): number {
    return this.run.stats.faxSent;
  }

  get speakerChargedToday(): boolean {
    return this.speakerCharged;
  }

  /** True when the machine was left jammed — by you last night, or by someone
   *  who does not think much of you this morning. */
  get faxJammedOnArrival(): boolean {
    return (this.run.flags['fax.jamOpen'] ?? 0) > 0;
  }

  markLearned(tokens: readonly string[]): void {
    for (const token of tokens) {
      if (!this.run.learned.includes(token)) this.run.learned.push(token);
    }
  }

  get learned(): readonly string[] {
    return this.run.learned;
  }

  /** Consumes the job from the tray. Abandoned jobs stay: the paper does not
   *  go away because you gave up on it. */
  completeJob(jobId: string, consumed: boolean): void {
    if (!consumed) return;
    const index = this.jobs.findIndex((job) => job.id === jobId);
    if (index >= 0) this.jobs.splice(index, 1);
  }

  setJamOpen(open: boolean): void {
    this.run.flags['fax.jamOpen'] = open ? 1 : 0;
  }

  chargeSpeakerDay(): void {
    this.speakerCharged = true;
  }

  /**
   * Schedule the misdial reply as a MINUTE COUNT, never a wall-clock timer: a
   * real timer breaks seed replay and behaves differently across a pause on
   * different machines. If five o'clock arrives first the reply is simply
   * dropped — it is a joke, not an obligation.
   */
  scheduleMisdialReply(rng: Rng): void {
    const { min, max } = BALANCE.fax.misdialReplyMinutes;
    this.pendingReplyMinute = this.clock.minute + rng.int(min, max);
  }

  /** Returns true exactly once, on the minute the reply lands. */
  takeMisdialReply(minute: number): boolean {
    if (this.pendingReplyMinute === null || minute < this.pendingReplyMinute) return false;
    this.pendingReplyMinute = null;
    return true;
  }

  /**
   * The fax panel closed. Applies every consequence in one place so the scene
   * stays presentation-only, and parks the outcome for OfficeScene to narrate
   * once the modal is gone — the reward has to land outside the panel, or the
   * walk back to your cubicle is not the beat it should be.
   */
  finishFax(outcome: FaxOutcome | null): void {
    this.lastFaxOutcome = outcome;
    if (!outcome) return;

    this.applyDeltas(faxOutcomeDeltas(outcome, this.run.stats.faxSent, this.speakerCharged));
    if (outcome.speakerUsed) this.chargeSpeakerDay();
    this.markLearned(outcome.learnedNow);
    this.run.stats.faxJams += outcome.jams;

    if (outcome.kind === 'sent') {
      this.run.stats.faxSent += 1;
      this.completeJob(outcome.jobId, true);
      this.setJamOpen(false);
    } else if (outcome.kind === 'misdialed') {
      // The transmission succeeded, so the paper leaves your tray. The bill
      // arrives later.
      this.completeJob(outcome.jobId, true);
      this.setJamOpen(false);
      this.scheduleMisdialReply(this.rng(`day:${this.run.dayIndex}:misdial:${outcome.jobId}`));
    } else {
      // Abandoned: the paper does not go away because you gave up on it.
      this.setJamOpen(outcome.jamLeftOpen);
    }
  }

  /** Drained once by OfficeScene after the modal lifts. */
  takeFaxOutcome(): FaxOutcome | null {
    const outcome = this.lastFaxOutcome;
    this.lastFaxOutcome = null;
    return outcome;
  }

  /** The panel refuses to open late in the day, so a last-minute burn cannot eat
   *  an afternoon that was already spent. */
  get faxAvailable(): boolean {
    return this.run.phase === 'working' && this.clock.minute < BALANCE.fax.lastCallMinute && this.nextJob !== null;
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

  /** Built once at boot from the real tile grid, then memoised per goal. */
  installRouter(router: Router): void {
    this.router = router;
    // beginDay may already have run (cold boot orders OfficeScene after Boot),
    // so build the plan now rather than waiting for tomorrow morning.
    this.rebuildDayPlan();
  }

  get plan(): DayPlan {
    return this.dayPlan;
  }

  private rebuildDayPlan(): void {
    if (!this.router) return;
    this.dayPlan = buildDayPlan(this.router, this.rng(`day:${this.run.dayIndex}:cast`));
  }

  // --- the Steve situation -------------------------------------------------

  get steveScenario(): SteveStage {
    return this.steveStage;
  }

  setSteveStage(stage: SteveStage): void {
    this.steveStage = stage;
  }

  /** True once the player has burned him. Persisted: people remember. */
  get steveBurned(): boolean {
    return (this.run.flags['grudge.steve'] ?? 0) > 0;
  }

  burnSteve(): void {
    this.run.flags['grudge.steve'] = 1;
  }

  /** Dale asks you first from now on. The durable half of selling Steve out. */
  get daleTrusts(): boolean {
    return (this.run.flags['dale.trusts'] ?? 0) > 0;
  }

  earnDaleTrust(): void {
    this.run.flags['dale.trusts'] = 1;
  }

  /**
   * Steve's filing, pushed to the FRONT of your tray.
   *
   * The front is the entire point. Appended to the back of a tray nobody empties
   * in a 480-minute day, his work would never actually land on you and covering
   * would be a gift rather than a choice. At the front it displaces your own
   * output at full opportunity cost — and it is what makes Dale's "did you
   * really do his filing?" a question with an answer.
   */
  addSteveJob(): void {
    const job = buildTray(this.rng(`day:${this.run.dayIndex}:steveJob`), this.run.dayIndex)[0];
    if (!job) return;
    const favorJob: FaxJob = { ...job, id: `steve:${this.run.dayIndex}`, owner: 'colleague', colleagueId: 'steve' };
    this.jobs.unshift(favorJob);
    this.steveJobId = favorJob.id;
  }

  /** Whether his stack actually went out — the fact Dale's check turns on. */
  get steveJobSent(): boolean {
    return this.steveJobId !== null && !this.jobs.some((job) => job.id === this.steveJobId);
  }

  /** Remove a job outright: Steve taking the ugly one off your hands. */
  dropNextJob(): boolean {
    if (this.jobs.length === 0) return false;
    this.jobs.shift();
    return true;
  }

  /** Pat's back-dating: the output without the walk. */
  creditJobWithoutSending(): boolean {
    const job = this.jobs.shift();
    if (!job) return false;
    this.run.stats.faxSent += 1;
    adjustMeter(this.run.meters, METER.productivity, BALANCE.dialogue.sinks.patProductivity);
    return true;
  }

  /** One fax fact the player has not yet learned, for Dennis to give away. */
  nextUnlearnedFaxToken(): string | null {
    return FAX_TOKENS.find((token) => !this.run.learned.includes(token)) ?? null;
  }

  // --- favors --------------------------------------------------------------

  /** Per-NPC tokens, straight out of the persisted flags record. */
  favorWith(id: string): number {
    return this.run.flags[`favor.${id}`] ?? 0;
  }

  /** True if the token was granted; false at the cap, so the caller can show
   *  the capped line instead of a silent nothing. */
  grantFavor(id: string): boolean {
    const key = `favor.${id}`;
    const held = this.run.flags[key] ?? 0;
    if (held >= BALANCE.dialogue.favorCap) return false;
    this.run.flags[key] = held + 1;
    return true;
  }

  /** Cash one in. Returns false when there is nothing owed. */
  spendFavor(id: string): boolean {
    const key = `favor.${id}`;
    const held = this.run.flags[key] ?? 0;
    if (held <= 0) return false;
    this.run.flags[key] = held - 1;
    return true;
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

    resetDailyMeters(this.run.meters);
    this.speakerCharged = false;
    this.pendingReplyMinute = null;
    // Rebuilt from the seed every morning and never persisted, so an abandoned
    // day regenerates an identical tray and there is nothing to migrate.
    this.jobs = buildTray(this.rng(`day:${this.run.dayIndex}:fax`), this.run.dayIndex);
    this.steveStage = 'none';
    this.steveJobId = null;
    // Today's staging. Rebuilt from the seed every morning and never persisted.
    this.rebuildDayPlan();

    // Someone left the machine jammed. Either you did, last night, or your
    // colleagues have stopped clearing it for you.
    if (!this.faxJammedOnArrival) {
      const roll = this.rng(`day:${this.run.dayIndex}:foreignJam`).next();
      const chance = foreignJamChance(this.run.meters[METER.coworkerRep] ?? 0);
      if (roll < chance) this.setJamOpen(true);
    }

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
    const weekendNight = isLastDayOfWeek(this.run.dayIndex);
    commitDayAdvance(this.run, record);
    // After the commit: the night happens between the day that ended and the one
    // that starts, and the record above must capture the day as it was lived.
    applyOvernight(this.run.meters, weekendNight);
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
