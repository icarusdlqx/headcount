import { FLAGS } from '../util/flags';
import { resolveRunSeed } from '../util/rng';
import { createRunState, type RunState } from '../sim/DayState';
import { applySave, readSaveString, toSave } from './schema';
import { SAVE_KEY, detectBackend, memoryBackend, type StorageBackend, type StorageKind } from './storage';

/**
 * The façade. Loads once at boot, writes at exactly two moments, and never
 * throws — a browser that refuses to keep records is a notice in the status bar,
 * not a black canvas.
 */

/** Content keys, not prose. Persistence has no dependency on the HUD, so M9's
 *  title screen can present the same notices in its own chrome. */
export type NoticeKey = 'save.unavailable' | 'save.quota' | 'save.tooNew' | 'save.corrupt' | 'save.leftEarly' | 'save.scratch';

export class SaveService {
  private backend: StorageBackend;
  private readonly noticeList: NoticeKey[] = [];
  private readonly scratch: boolean;

  readonly state: RunState;

  private constructor(backend: StorageBackend, state: RunState, scratch: boolean, notices: NoticeKey[]) {
    this.backend = backend;
    this.state = state;
    this.scratch = scratch;
    this.noticeList = notices;
  }

  /**
   * Load, validate and repair, all inside BootScene before any scene depends on
   * the result. A corrupt save that throws inside a running scene is a black
   * canvas with no reset UI — effectively a bricked browser profile.
   */
  static boot(now: number): SaveService {
    const notices: NoticeKey[] = [];

    // A pinned seed is a scratch run: nothing is read, written or cleared. A
    // replay must not clobber a real week, and a real week's saved seed must not
    // override the pin.
    if (FLAGS.scratch) {
      notices.push('save.scratch');
      const seed = resolveRunSeed(FLAGS.seed, null);
      return new SaveService(memoryBackend(), createRunState(seed), true, notices);
    }

    const backend = detectBackend();
    if (backend.kind === 'memory') notices.push('save.unavailable');

    const raw = backend.read(SAVE_KEY);
    if (raw === null) {
      const seed = resolveRunSeed(null, null);
      return new SaveService(backend, createRunState(seed), false, notices);
    }

    const outcome = readSaveString(raw);

    if (outcome.kind === 'too-new') {
      // The one case where refusing to save is correct. Swap to memory so the
      // newer save survives this session untouched.
      notices.push('save.tooNew');
      const seed = resolveRunSeed(null, null);
      return new SaveService(memoryBackend(), createRunState(seed), true, notices);
    }

    if (outcome.kind === 'unreadable') {
      notices.push('save.corrupt');
      const seed = resolveRunSeed(null, null);
      const service = new SaveService(backend, createRunState(seed), false, notices);
      service.write(now);
      return service;
    }

    const state = applySave(outcome.save);

    // A non-null openDay means the player closed the tab mid-afternoon. That day
    // runs again from 9:00 with byte-identical events: uncommitted progress was
    // never committed, so quitting is never a re-roll and never profitable.
    if (state.openDay !== null) {
      state.daysAbandoned += 1;
      state.openDay = null;
      notices.push('save.leftEarly');
    }

    return new SaveService(backend, state, false, notices);
  }

  get storageKind(): StorageKind {
    return this.backend.kind;
  }

  get canPersist(): boolean {
    return !this.scratch && this.backend.kind === 'local';
  }

  /** Drained once by OfficeScene. */
  get notices(): readonly NoticeKey[] {
    return this.noticeList;
  }

  takeNotices(): NoticeKey[] {
    return this.noticeList.splice(0, this.noticeList.length);
  }

  /** Marks the day as in progress, so a tab closed at 11:40 re-runs it. */
  beginDay(now: number): void {
    this.state.openDay = this.state.dayIndex;
    this.write(now);
  }

  /** Called after commitDayAdvance, which is atomic — there is no half-advanced
   *  state for this write to capture. */
  commitDay(now: number): boolean {
    return this.write(now);
  }

  wipe(): void {
    this.backend.wipeNamespace();
  }

  private write(now: number): boolean {
    if (this.scratch) return false;

    let blob: string;
    try {
      blob = JSON.stringify(toSave(this.state, now));
    } catch {
      return false;
    }

    if (this.backend.write(SAVE_KEY, blob)) return true;

    // One retry after clearing the namespace, then memory for the rest of the
    // session. Never a retry loop.
    this.backend.wipeNamespace();
    if (this.backend.write(SAVE_KEY, blob)) return true;

    this.backend = memoryBackend();
    if (!this.noticeList.includes('save.quota')) this.noticeList.push('save.quota');
    return false;
  }
}
