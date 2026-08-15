import { BALANCE } from '../config/balance';
import type { Rng } from '../util/rng';
import type { DayEndInfo } from '../sim/events';
import { ROOMS } from '../world/officeMap';
import { MINUTES_PER_DAY } from '../sim/DayClock';
import { fill, formatHoursMinutes, groupThousands } from './format';
import dayEndContent from '../content/dayEnd.json';

/**
 * Turns a finished day into the rows the summary dialog draws.
 *
 * A PURE function of (payload, rng). That is what makes the screen re-render
 * identically and what makes it unit-testable without a canvas.
 *
 * The M3 seam is SummaryRow.bar: adding the three meters means adding rows here
 * and labels to dayEnd.json. The dialog builder never changes.
 */

interface RemarkPool {
  id: string;
  requires?: string;
  lines: string[];
}

interface DayEndContent {
  window: { titleFormat: string; heading: string; subheading: string; okLabel: string };
  rows: Record<string, string>;
  values: Record<string, string>;
  remarks: RemarkPool[];
  weekend: string[];
  morning: { first: string[]; monday: string[]; midweek: string[] };
  notices: Record<string, string>;
}

// resolveJsonModule widens the heterogeneous remarks array, so the cast is
// required rather than lazy. Same pattern as the flavour table in OfficeScene.
export const CONTENT = dayEndContent as unknown as DayEndContent;

export interface SummaryRow {
  readonly label: string;
  readonly value: string;
  /** 0..1. Renders as a sunken progress well instead of a value string.
   *  This field is the entire M3 meter slot. */
  readonly bar?: number;
}

export interface DayEndView {
  readonly title: string;
  readonly heading: string;
  readonly subheading: string;
  readonly rows: readonly SummaryRow[];
  readonly remark: string;
  readonly okLabel: string;
}

/** Named predicates referenced by string from JSON: writers get conditional
 *  lines without expressions ending up in a data file. */
export const REMARK_PREDICATES: Readonly<Record<string, (info: DayEndInfo) => boolean>> = {
  neverLeftFarm: (info) => info.stats.roomsEntered.length <= 1,
  longStationary: (info) => info.stats.longestStationaryMs >= BALANCE.dayEnd.longStationaryMs,
  lowDistance: (info) => feetOf(info) < BALANCE.dayEnd.lowDistanceFeet,
  visitedEveryRoom: (info) => info.stats.roomsEntered.length >= ROOMS.length,
  lastDayOfWeek: (info) => info.lastOfWeek,
};

function feetOf(info: DayEndInfo): number {
  return Math.round((info.stats.distancePx / BALANCE.view.tileSize) * BALANCE.dayEnd.feetPerTile);
}

/** The token bag every template in this file interpolates against. */
function varsFor(info: DayEndInfo): Record<string, string | number> {
  const stationary = formatHoursMinutes(info.stats.longestStationaryMs / 60000);
  return {
    feet: groupThousands(feetOf(info)),
    total: ROOMS.length,
    visited: info.stats.roomsEntered.length,
    count: info.stats.objectsExamined,
    week: info.week,
    done: info.weekSoFar,
    stationary:
      stationary.hours > 0
        ? fill(CONTENT.values['hoursMinutes']!, stationary)
        : fill(CONTENT.values['minutes']!, { minutes: Math.max(1, stationary.minutes) }),
  };
}

/** First matching pool wins IN FILE ORDER, so the choice is replayable. */
export function pickRemark(info: DayEndInfo, rng: Rng): string {
  const vars = varsFor(info);
  for (const pool of CONTENT.remarks) {
    if (pool.requires === undefined) continue;
    const predicate = REMARK_PREDICATES[pool.requires];
    if (predicate && predicate(info) && pool.lines.length > 0) {
      return fill(rng.pick(pool.lines), vars);
    }
  }
  const fallback = CONTENT.remarks.find((pool) => pool.id === 'default');
  if (!fallback || fallback.lines.length === 0) return '';
  return fill(rng.pick(fallback.lines), vars);
}

export function buildDayEndView(
  info: DayEndInfo,
  rng: Rng,
  weekdayShort: string,
  weekdayLong: string,
): DayEndView {
  const vars = varsFor(info);
  const rows = CONTENT.rows;
  const values = CONTENT.values;
  const onPremises = formatHoursMinutes(MINUTES_PER_DAY);

  return {
    title: fill(CONTENT.window.titleFormat, { weekday: weekdayShort }),
    heading: fill(CONTENT.window.heading, { weekdayLong, week: info.week }),
    subheading: CONTENT.window.subheading,
    okLabel: CONTENT.window.okLabel,
    rows: [
      // Identical every single day, which takes about four days to land and is
      // better for the wait.
      { label: rows['timeOnPremises']!, value: fill(values['hoursMinutes']!, onPremises) },
      { label: rows['roomsEntered']!, value: fill(values['roomsEntered']!, vars) },
      { label: rows['distanceCovered']!, value: fill(values['distanceCovered']!, vars) },
      { label: rows['longestStationary']!, value: String(vars['stationary']) },
      { label: rows['objectsExamined']!, value: fill(values['objectsExamined']!, vars) },
      // The punchline row and the M3 slot in one object. An empty meter frame
      // reading 0/100 would be a placeholder wearing a costume.
      { label: rows['workCompleted']!, value: values['workCompleted']! },
      { label: rows['weekToDate']!, value: fill(values['weekToDate']!, { done: info.weekSoFar, total: BALANCE.week.daysPerWeek }) },
    ],
    remark: pickRemark(info, rng),
  };
}

/**
 * Dev-only: a writer's typo in `requires` would otherwise silently mean a pool
 * that never fires. Same posture as buildTileGrid throwing on a ragged row.
 */
export function assertContentIntegrity(): string[] {
  const problems: string[] = [];
  for (const pool of CONTENT.remarks) {
    if (pool.requires !== undefined && !REMARK_PREDICATES[pool.requires]) {
      problems.push(`dayEnd.json: remark "${pool.id}" requires unknown predicate "${pool.requires}"`);
    }
    if (pool.lines.length === 0) problems.push(`dayEnd.json: remark "${pool.id}" has no lines`);
  }
  if (!CONTENT.remarks.some((pool) => pool.id === 'default')) {
    problems.push('dayEnd.json: no "default" remark pool');
  }
  return problems;
}
