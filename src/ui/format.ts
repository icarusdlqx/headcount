import { BALANCE } from '../config/balance';

/**
 * Formatting only. No prose lives here — every literal a player reads comes from
 * src/content/. These functions take the templates.
 */

/** Fills {tokens} from a bag. An unknown token is left visible on purpose: a
 *  writer's typo should be obvious on screen, not silently blank. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

export interface ClockParts {
  readonly hour12: number;
  readonly minute: number;
  readonly meridiemIndex: 0 | 1;
  readonly hour24: number;
}

/** Splits minutes-since-9:00 into display parts. Pure arithmetic, no strings. */
export function clockParts(minutesSinceStart: number): ClockParts {
  const total = BALANCE.clock.startHour * 60 + minutesSinceStart;
  const hour24 = Math.floor(total / 60) % 24;
  const minute = total % 60;
  // The trap: hour24 % 12 is 0 at both midnight and noon, which renders "0:00 PM".
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return { hour12, minute, meridiemIndex: hour24 >= 12 ? 1 : 0, hour24 };
}

/** "9:00 AM", "12:05 PM", "5:00 PM". No leading zero on the hour, no seconds —
 *  seconds would make the compression ratio legible and the fiction dies. */
export function formatClock(minutesSinceStart: number, timeFormat: string, meridiem: readonly string[]): string {
  const parts = clockParts(minutesSinceStart);
  return fill(timeFormat, {
    h: parts.hour12,
    mm: String(parts.minute).padStart(2, '0'),
    ap: meridiem[parts.meridiemIndex] ?? '',
  });
}

export function formatHoursMinutes(totalMinutes: number): { hours: number; minutes: number } {
  const whole = Math.max(0, Math.round(totalMinutes));
  return { hours: Math.floor(whole / 60), minutes: whole % 60 };
}

/** 1234 -> "1,234". Deliberately locale-free: the office is nowhere in particular. */
export function groupThousands(value: number): string {
  const rounded = Math.round(value);
  return String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
