import { describe, expect, it } from 'vitest';
import { clockParts, fill, formatClock, formatHoursMinutes, groupThousands } from './format';

const FORMAT = '{h}:{mm} {ap}';
const MERIDIEM = ['AM', 'PM'];

describe('formatClock', () => {
  it('formats the boundaries the eye never catches', () => {
    // Pinned inputs, because playing to 11:55 AM to check it takes four minutes.
    expect(formatClock(0, FORMAT, MERIDIEM)).toBe('9:00 AM');
    expect(formatClock(179, FORMAT, MERIDIEM)).toBe('11:59 AM');
    expect(formatClock(180, FORMAT, MERIDIEM)).toBe('12:00 PM');
    expect(formatClock(181, FORMAT, MERIDIEM)).toBe('12:01 PM');
    expect(formatClock(479, FORMAT, MERIDIEM)).toBe('4:59 PM');
    expect(formatClock(480, FORMAT, MERIDIEM)).toBe('5:00 PM');
  });

  it('never renders hour zero', () => {
    // hour24 % 12 is 0 at noon, which naively renders "0:00 PM".
    for (let minute = 0; minute <= 480; minute++) {
      expect(clockParts(minute).hour12).toBeGreaterThanOrEqual(1);
      expect(clockParts(minute).hour12).toBeLessThanOrEqual(12);
    }
  });
});

describe('fill', () => {
  it('substitutes tokens and leaves unknown ones visible', () => {
    expect(fill('{a} and {b}', { a: 1, b: 'two' })).toBe('1 and two');
    // A writer's typo should be obvious on screen, not silently blank.
    expect(fill('{missing}', {})).toBe('{missing}');
  });
});

describe('formatHoursMinutes', () => {
  it('splits minutes into hours and minutes', () => {
    expect(formatHoursMinutes(480)).toEqual({ hours: 8, minutes: 0 });
    expect(formatHoursMinutes(75)).toEqual({ hours: 1, minutes: 15 });
    expect(formatHoursMinutes(-5)).toEqual({ hours: 0, minutes: 0 });
  });
});

describe('groupThousands', () => {
  it('groups digits', () => {
    expect(groupThousands(7)).toBe('7');
    expect(groupThousands(1234)).toBe('1,234');
    expect(groupThousands(1234567)).toBe('1,234,567');
  });
});
