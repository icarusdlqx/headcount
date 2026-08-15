import { describe, expect, it } from 'vitest';
import { BALANCE } from '../config/balance';
import { beginDay, commitDayAdvance, createRunState } from '../sim/DayState';
import { applySave, coerceSave, readSaveString, toSave } from './schema';
import { hashSeed } from '../util/rng';

const NOW = 1_700_000_000_000;

function populated() {
  const state = createRunState(4242);
  beginDay(state);
  state.stats.distancePx = 900;
  commitDayAdvance(state, {
    dayIndex: 0,
    weekday: 0,
    distanceFt: 84,
    roomsEntered: 4,
    objectsExamined: 6,
    productivity: 42,
    faxSent: 2,
  });
  state.meters['productivity'] = 37;
  state.flags['favor.steve'] = 2;
  state.learned.push('fax.sequence.9');
  return state;
}

describe('save round trip', () => {
  it('preserves every persisted field', () => {
    const state = populated();
    const restored = applySave(JSON.parse(JSON.stringify(toSave(state, NOW))));

    expect(restored.runSeed).toBe(state.runSeed);
    expect(restored.dayIndex).toBe(state.dayIndex);
    expect(restored.daysAbandoned).toBe(state.daysAbandoned);
    expect(restored.week).toEqual(state.week);
    expect(restored.meters['productivity']).toBe(37);
    expect(restored.flags['favor.steve']).toBe(2);
    expect(restored.learned).toEqual(['fax.sequence.9']);
  });

  it('does not persist position, elapsed time or phase', () => {
    const blob = JSON.stringify(toSave(populated(), NOW));
    expect(blob).not.toMatch(/"x"|"y"|minutesElapsed|"phase"/);
  });

  it('starts a restored run outside the working phase', () => {
    // The working state must only ever be entered through beginDay(), which is
    // what guarantees the clock was reset first.
    expect(applySave(toSave(populated(), NOW)).phase).not.toBe('working');
  });

  it('gives a meter added later its default rather than undefined', () => {
    const save = toSave(populated(), NOW);
    delete (save.meters as Record<string, number>)['stress'];
    expect(applySave(save).meters['stress']).toBe(BALANCE.meters.startStress);
  });
});

describe('readSaveString', () => {
  it('accepts a save it wrote', () => {
    const outcome = readSaveString(JSON.stringify(toSave(populated(), NOW)));
    expect(outcome.kind).toBe('ok');
  });

  it('classifies every unusable input', () => {
    expect(readSaveString('{"version":1,').kind).toBe('unreadable');
    expect(readSaveString('[]')).toMatchObject({ kind: 'unreadable', reason: 'not-object' });
    expect(readSaveString('{"dayIndex":3}')).toMatchObject({ kind: 'unreadable', reason: 'no-version' });
    expect(readSaveString('x'.repeat(200), 100)).toMatchObject({
      kind: 'unreadable',
      reason: 'too-large',
    });
  });

  it('refuses a save from a newer build without touching it', () => {
    const outcome = readSaveString('{"version":9,"dayIndex":40}');
    expect(outcome).toMatchObject({ kind: 'too-new', foundVersion: 9 });
  });

  it('applies the length gate before parsing', () => {
    // A 10MB parse on the boot path is a visible hang; the gate is free.
    const huge = `{"version":1,"pad":"${'x'.repeat(BALANCE.save.maxBlobChars)}"}`;
    expect(readSaveString(huge)).toMatchObject({ kind: 'unreadable', reason: 'too-large' });
  });
});

describe('coerceSave', () => {
  it('repairs field by field rather than rejecting the save', () => {
    const hostile = {
      version: 1,
      runSeed: 77,
      dayIndex: 12,
      openDay: null,
      daysAbandoned: Number.NaN, // bad
      savedAt: 'yesterday', // bad
      week: [null, { dayIndex: 1, weekday: 99, distanceFt: -5 }],
      meters: { productivity: Number.NaN, bossApproval: 60, sneaky: '42' },
      flags: { 'favor.steve': 1 },
      learned: ['a', 3, 'b'],
    };

    const save = coerceSave(hostile as unknown as Record<string, unknown>);

    // The assertion that matters: one bad meter must not cost the player their week.
    expect(save.dayIndex).toBe(12);
    expect(save.runSeed).toBe(77);
    expect(save.daysAbandoned).toBe(0);
    expect(save.savedAt).toBe(0);
    expect(save.meters['bossApproval']).toBe(60);
    expect(save.meters['productivity']).toBeUndefined();
    // Numeric strings are not coerced: accepting "42" hides the bug that made it.
    expect(save.meters['sneaky']).toBeUndefined();
    expect(save.learned).toEqual(['a', 'b']);
    expect(save.week[0]?.weekday).toBeLessThan(BALANCE.week.daysPerWeek);
  });

  it('clamps an absurd dayIndex instead of letting it through', () => {
    const save = coerceSave({ version: 1, dayIndex: 1e309 });
    expect(save.dayIndex).toBe(BALANCE.save.maxDayIndex);
  });

  it('does not pollute Object.prototype', () => {
    const raw = `{"version":1,"dayIndex":1,"flags":{"__proto__":{"isAdmin":true},"constructor":{"x":1},"ok":2}}`;
    const outcome = readSaveString(raw);
    expect(outcome.kind).toBe('ok');
    if (outcome.kind !== 'ok') return;

    expect(({} as Record<string, unknown>)['isAdmin']).toBeUndefined();
    expect(Object.keys(outcome.save.flags)).toEqual(['ok']);
  });

  it('caps open records and lists at write time so the blob cannot creep', () => {
    const state = createRunState(1);
    for (let i = 0; i < 400; i++) state.learned.push(`entry-${i}`);
    for (let i = 0; i < 400; i++) state.flags[`f${i}`] = i;

    const save = toSave(state, NOW);
    expect(save.learned.length).toBe(BALANCE.save.maxLearnedEntries);
    expect(Object.keys(save.flags).length).toBe(BALANCE.save.maxFlagEntries);
  });
});

describe('seed determinism', () => {
  it('derives independent streams per channel', () => {
    // Consuming one channel must not shift another, or M3 adding an event roll
    // silently changes M2's weekend gag.
    const seed = 999;
    const flavourFirst = hashSeed(`${seed}|flavour`);
    const summaryFirst = hashSeed(`${seed}|day:3:summary`);
    expect(flavourFirst).not.toBe(summaryFirst);
    expect(hashSeed(`${seed}|flavour`)).toBe(flavourFirst);
  });
});
