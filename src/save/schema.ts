import { BALANCE } from '../config/balance';
import { createRunState, type DayRecord, type RunState } from '../sim/DayState';
import { TRANSIENT_METERS, sanitiseMeters } from '../sim/meters';

/**
 * The save blob, and the reader that survives whatever is actually in the key.
 * Pure: no Phaser, no DOM, no localStorage. The storage key itself lives in
 * storage.ts, which is the environment boundary.
 */

export const SAVE_VERSION = 1;

export interface SaveV1 {
  /** ALWAYS the first field written and the first field read. */
  version: 1;
  runSeed: number;
  /** Workdays completed. Also the day to resume at. */
  dayIndex: number;
  /** Non-null => the player left before five. That day is re-run, same seed. */
  openDay: number | null;
  daysAbandoned: number;
  /** Diagnostic only. Nothing branches on wall-clock arithmetic. */
  savedAt: number;
  week: DayRecord[];
  meters: Record<string, number>;
  flags: Record<string, number>;
  learned: string[];
}

/**
 * Deliberately absent, each for a stated reason:
 *
 * - Player x/y and any tile coordinate. The map is ASCII and expected to be
 *   edited; a saved position plus an edited map spawns you inside a wall with no
 *   in-game escape. Every morning starts at your own cubicle, which is correct
 *   in tone anyway.
 * - Elapsed minutes. We resume at the start of the day, so it would be a field
 *   written only to be ignored.
 * - phase. A UI state, never restored.
 * - Rendered prose. Everything symbolic is a content key, so a writer's rewrite
 *   reaches a save written last week.
 * - A checksum. Single-player, offline, no leaderboard. Clamping exists so meter
 *   bars don't draw outside their bevel, not to enforce honesty. Written down
 *   here so nobody adds an HMAC later.
 */

export function toSave(state: RunState, now: number): SaveV1 {
  return {
    version: SAVE_VERSION,
    runSeed: state.runSeed,
    dayIndex: clampInt(state.dayIndex, 0, BALANCE.save.maxDayIndex, 0),
    openDay: state.openDay === null ? null : clampInt(state.openDay, 0, BALANCE.save.maxDayIndex, 0),
    daysAbandoned: clampInt(state.daysAbandoned, 0, Number.MAX_SAFE_INTEGER, 0),
    savedAt: now,
    week: state.week.slice(-BALANCE.save.maxWeekRecords),
    // Transient meters are filtered out here rather than at the call site, so
    // there is exactly one place that decides what a save contains.
    meters: capRecord(state.meters, BALANCE.save.maxMeterEntries, TRANSIENT_METERS),
    flags: capRecord(state.flags, BALANCE.save.maxFlagEntries),
    // Deduped and sorted at write time so the blob cannot creep toward a real
    // quota error one fax sequence at a time.
    learned: Array.from(new Set(state.learned)).sort().slice(0, BALANCE.save.maxLearnedEntries),
  };
}

export function applySave(save: SaveV1): RunState {
  // Meters overlay the defaults rather than replacing them, so a save written
  // before a meter existed still has that meter at its starting value instead of
  // undefined. This is what lets M3 add a meter without a schema bump.
  const base = createRunState(save.runSeed);
  for (const key of Object.keys(save.meters)) {
    base.meters[key] = save.meters[key]!;
  }

  // Repairs a hand-edited save and gives Visibility its morning reading, which
  // is never in the blob.
  sanitiseMeters(base.meters);

  base.dayIndex = save.dayIndex;
  base.openDay = save.openDay;
  base.daysAbandoned = save.daysAbandoned;
  base.week = save.week;
  base.flags = save.flags;
  base.learned = save.learned;
  return base;
}

// --- reading -------------------------------------------------------------

export type ReadOutcome =
  | { kind: 'ok'; save: SaveV1; fromVersion: number }
  | { kind: 'too-new'; foundVersion: number }
  | { kind: 'unreadable'; reason: 'parse' | 'not-object' | 'no-version' | 'too-large' };

/**
 * Length gate -> parse -> version gate -> coerce.
 *
 * Repair-shaped, not reject-shaped: one NaN in meters must not cost the player
 * their week. The one case where refusing is correct is a save from a NEWER
 * build — that one is left byte-identical in storage rather than downgraded.
 */
export function readSaveString(raw: string, maxChars: number = BALANCE.save.maxBlobChars): ReadOutcome {
  // Before JSON.parse, not after: a 10MB parse on the boot path is a visible hang.
  if (raw.length > maxChars) return { kind: 'unreadable', reason: 'too-large' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: 'unreadable', reason: 'parse' };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { kind: 'unreadable', reason: 'not-object' };
  }

  const record = parsed as Record<string, unknown>;
  const version = record['version'];
  if (typeof version !== 'number' || !Number.isFinite(version)) {
    return { kind: 'unreadable', reason: 'no-version' };
  }
  if (version > SAVE_VERSION) return { kind: 'too-new', foundVersion: version };

  // MIGRATIONS[i] upgrades version i+1 to i+2. Empty until the first bump; the
  // chain ships now so that bump is routine rather than an excavation.
  let working = record;
  for (let v = Math.max(1, Math.trunc(version)); v < SAVE_VERSION; v++) {
    const step = MIGRATIONS[v - 1];
    if (!step) break;
    working = step(working);
  }

  return { kind: 'ok', save: coerceSave(working), fromVersion: version };
}

export type MigrationStep = (prev: Record<string, unknown>) => Record<string, unknown>;

/**
 * Migrations MUST inline their own literal constants and never import BALANCE.
 * If migrate1to2 defaulted a meter to BALANCE.meters.startStress and a designer
 * retuned it in March, the same v1 save would migrate to different values on the
 * February and March builds. This is the one sanctioned exception to the
 * balance-file rule, and it is noted in balance.ts too.
 */
export const MIGRATIONS: readonly MigrationStep[] = [];

// --- coercion ------------------------------------------------------------

/**
 * Repair-shaped, not reject-shaped. The distinction that matters: JSON.parse
 * turns an overflowing literal like 1e309 into Infinity, and treating that as
 * "unusable, fall back to 0" would silently reset a player to their first Monday.
 * Infinity clamps to the bound. Only NaN — a number that means nothing at all —
 * takes the fallback.
 */
function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  if (value === Number.POSITIVE_INFINITY) return max;
  if (value === Number.NEGATIVE_INFINITY) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function clampNum(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  if (value === Number.POSITIVE_INFINITY) return max;
  if (value === Number.NEGATIVE_INFINITY) return min;
  return Math.min(max, Math.max(min, value));
}

/** Keys that must never be copied out of parsed data onto an object. */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const EMPTY_SET: ReadonlySet<string> = new Set<string>();

/**
 * Accumulates onto a null-prototype object and skips the dangerous keys.
 * JSON.parse itself is safe; the danger is everything downstream of it. Never
 * Object.assign or spread parsed data over a defaults object.
 */
function capRecord(
  source: Record<string, number>,
  max: number,
  exclude: ReadonlySet<string> = EMPTY_SET,
): Record<string, number> {
  const out: Record<string, number> = Object.create(null) as Record<string, number>;
  let count = 0;
  for (const key of Object.keys(source)) {
    if (count >= max) break;
    if (FORBIDDEN_KEYS.has(key) || exclude.has(key)) continue;
    const value = source[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    out[key] = value;
    count++;
  }
  return out;
}

function coerceNumberRecord(value: unknown, max: number): Record<string, number> {
  const out: Record<string, number> = Object.create(null) as Record<string, number>;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return out;
  let count = 0;
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (count >= max) break;
    if (FORBIDDEN_KEYS.has(key)) continue;
    const entry = (value as Record<string, unknown>)[key];
    // Numeric strings are NOT coerced: "42" is a repair, and accepting it hides
    // whatever bug produced it.
    if (typeof entry !== 'number' || !Number.isFinite(entry)) continue;
    out[key] = entry;
    count++;
  }
  return out;
}

function coerceStringList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (out.length >= max) break;
    if (typeof entry === 'string' && entry.length > 0 && entry.length <= 64) out.push(entry);
  }
  return out;
}

function coerceWeek(value: unknown, max: number): DayRecord[] {
  if (!Array.isArray(value)) return [];
  const out: DayRecord[] = [];
  for (const entry of value) {
    if (out.length >= max) break;
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    out.push({
      dayIndex: clampInt(record['dayIndex'], 0, BALANCE.save.maxDayIndex, 0),
      weekday: clampInt(record['weekday'], 0, BALANCE.week.daysPerWeek - 1, 0),
      distanceFt: clampInt(record['distanceFt'], 0, 1_000_000, 0),
      roomsEntered: clampInt(record['roomsEntered'], 0, 999, 0),
      objectsExamined: clampInt(record['objectsExamined'], 0, 99_999, 0),
      // Defaulted to 0 for a record written by the M2 build, which had neither.
      productivity: clampInt(record['productivity'], BALANCE.meters.min, BALANCE.meters.max, 0),
      faxSent: clampInt(record['faxSent'], 0, 999, 0),
    });
  }
  return out;
}

/** Field by field, explicit reads only. dayIndex surviving is the whole point. */
export function coerceSave(raw: Record<string, unknown>): SaveV1 {
  const openDayRaw = raw['openDay'];
  return {
    version: SAVE_VERSION,
    runSeed: clampInt(raw['runSeed'], 0, 0xffffffff, 0),
    dayIndex: clampInt(raw['dayIndex'], 0, BALANCE.save.maxDayIndex, 0),
    openDay:
      openDayRaw === null || openDayRaw === undefined
        ? null
        : clampInt(openDayRaw, 0, BALANCE.save.maxDayIndex, 0),
    daysAbandoned: clampInt(raw['daysAbandoned'], 0, 99_999, 0),
    savedAt: clampNum(raw['savedAt'], 0, Number.MAX_SAFE_INTEGER, 0),
    week: coerceWeek(raw['week'], BALANCE.save.maxWeekRecords),
    meters: coerceNumberRecord(raw['meters'], BALANCE.save.maxMeterEntries),
    flags: coerceNumberRecord(raw['flags'], BALANCE.save.maxFlagEntries),
    learned: coerceStringList(raw['learned'], BALANCE.save.maxLearnedEntries),
  };
}
