import { describe, expect, it } from 'vitest';
import { BALANCE } from '../config/balance';
import { makeRng } from '../util/rng';
import {
  DOORS,
  PRINTER_TOKENS,
  SEGMENTS,
  SEGMENT_VIEWS,
  createPrinter,
  openDoor,
  printerOutcomeDeltas,
  pull,
  readingAt,
  walkAway,
  type Segment,
} from './printer';
import { FAX_TOKENS } from './faxMachine';
import { METER } from './meters';

/** Force a machine onto a chosen segment, whatever the seed picked. */
function machineOn(segment: Segment, knowsCode = false) {
  const m = createPrinter(makeRng(1), knowsCode);
  return { ...m, segment, seen: [] as string[], discovered: [] as string[] } as ReturnType<typeof createPrinter>;
}

describe('the fairness contract', () => {
  /**
   * THE test. The original design had a segment where following the one stated
   * rule tore you anyway, with no way to read it first — 25% of jams shredding a
   * rule-following player on day one. Assumption 22 forbids exactly that.
   */
  it('never tears a player who opens the right door and pulls', () => {
    for (const segment of SEGMENTS) {
      const m = machineOn(segment);
      openDoor(m, SEGMENT_VIEWS[segment].free);
      const step = pull(m, false);

      expect(m.tears).toBe(0);
      expect(m.phase).toBe('cleared');
      expect(step.outcome?.kind).toBe('cleared');
    }
  });

  it('tells you what is behind every door before you can commit', () => {
    // No hidden state: the reading is always available, for every door, for
    // every jam, at a known price.
    for (const segment of SEGMENTS) {
      for (const door of DOORS) {
        const m = machineOn(segment);
        const step = openDoor(m, door);
        expect(['nothing', 'edgeFree', 'goesInFurther']).toContain(readingAt(m, door));
        expect(step.lcd.startsWith('read.')).toBe(true);
      }
    }
  });

  it('gives every jam exactly one safe door and at least one wrong one', () => {
    // No segment is a formality and none is a trap — the earlier design had one
    // of each, so half of all jams were not the triage decision they claimed.
    for (const segment of SEGMENTS) {
      const free = DOORS.filter((d) => readingAt(machineOn(segment), d) === 'edgeFree');
      const snagged = DOORS.filter((d) => readingAt(machineOn(segment), d) === 'goesInFurther');
      expect(free.length).toBe(1);
      expect(snagged.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('only tears you for a decision the machine already warned about', () => {
    const m = machineOn('fuser');
    openDoor(m, SEGMENT_VIEWS.fuser.snagged[0]!);
    expect(readingAt(m, m.openDoor!)).toBe('goesInFurther'); // it told you
    pull(m, false);
    expect(m.tears).toBe(1);
  });

  it('counts pulling blind as a decision too', () => {
    const m = machineOn('tray');
    expect(m.openDoor).toBeNull();
    pull(m, false);
    expect(m.tears).toBe(1);
  });
});

describe('diagnosis costs, and knowing is cheaper', () => {
  it('charges per door and nothing for a second look', () => {
    const m = machineOn('exit');
    const first = openDoor(m, 'A');
    const again = openDoor(m, 'A');
    expect(first.minutes).toBe(BALANCE.printer.minutes.openDoor);
    // You remember what was in there.
    expect(again.minutes).toBe(0);
  });

  it('makes a mastered clear cheaper than a blind search', () => {
    const blind = machineOn('exit');
    for (const door of DOORS) openDoor(blind, door);
    openDoor(blind, SEGMENT_VIEWS.exit.free);
    pull(blind, false);

    const knowing = machineOn('exit', true);
    openDoor(knowing, SEGMENT_VIEWS.exit.free);
    pull(knowing, false);

    expect(knowing.minutes).toBeLessThan(blind.minutes);
  });

  it('teaches the code by clearing it, and the diagram by opening panel A', () => {
    const m = machineOn('registration');
    expect(openDoor(m, 'A').learned).toBe('printer.diagram');
    openDoor(m, SEGMENT_VIEWS.registration.free);
    expect(pull(m, false).learned).toBe('printer.code.registration');
  });
});

describe('escalation', () => {
  it('shreds after three tears and stays shredded', () => {
    const m = machineOn('tray');
    const wrong = SEGMENT_VIEWS.tray.snagged[0]!;
    for (let i = 0; i < BALANCE.printer.shredAfterTears; i++) {
      openDoor(m, wrong);
      pull(m, false);
    }
    expect(m.phase).toBe('shredded');
    // No further clearing is possible today, however many times you come back.
    const after = pull(m, false);
    expect(after.minutes).toBe(0);
    expect(m.phase).toBe('shredded');
  });

  it('keeps the tears when you walk away, so leaving is not a reset', () => {
    // The jam does not un-crumple because you left the room. The machine is
    // built once per day on the director, never per session.
    const m = machineOn('tray');
    openDoor(m, SEGMENT_VIEWS.tray.snagged[0]!);
    pull(m, false);
    const step = walkAway(m, false);

    expect(step.outcome?.kind).toBe('abandoned');
    expect(m.tears).toBe(1);
    expect(m.phase).toBe('jammed');
  });
});

describe('what it pays', () => {
  const outcome = (over = {}) => ({
    kind: 'cleared' as const,
    tears: 0,
    minutes: 10,
    witnessed: false,
    learnedNow: [],
    ...over,
  });

  it('never pays Productivity, from any outcome, ever', () => {
    // Fixing the printer is not your job and nobody counts it as work. This also
    // keeps the fax the sole Output engine so a second source cannot inflate it.
    for (const kind of ['cleared', 'shredded', 'abandoned'] as const) {
      for (const tears of [0, 1, 3]) {
        const deltas = printerOutcomeDeltas(outcome({ kind, tears }), true);
        expect(deltas.find((d) => d.key === METER.productivity)).toBeUndefined();
      }
    }
  });

  it('is worth four times as much when somebody sees you do it', () => {
    // The satire, and the reason knowing the schedules matters.
    const alone = printerOutcomeDeltas(outcome(), true).find((d) => d.key === METER.coworkerRep)!;
    const seen = printerOutcomeDeltas(outcome({ witnessed: true }), true).find((d) => d.key === METER.coworkerRep)!;
    expect(seen.delta).toBeGreaterThan(alone.delta * 3);
  });

  it('makes a clean mastered clear the one job that lowers Strain', () => {
    const clean = printerOutcomeDeltas(outcome(), true).find((d) => d.key === METER.stress)!;
    const messy = printerOutcomeDeltas(outcome({ tears: 2 }), true).find((d) => d.key === METER.stress)!;
    expect(clean.delta).toBeLessThan(0);
    expect(messy.delta).toBeGreaterThan(0);
  });

  it('caps the Strain one incident can inflict', () => {
    const deltas = printerOutcomeDeltas(outcome({ kind: 'shredded', tears: 9 }), false);
    expect(deltas.find((d) => d.key === METER.stress)!.delta).toBeLessThanOrEqual(BALANCE.printer.strainCap);
  });
});

describe('mastery tokens', () => {
  it('are namespaced, unique, and fit the save cap alongside the fax', () => {
    expect(new Set(PRINTER_TOKENS).size).toBe(PRINTER_TOKENS.length);
    for (const token of PRINTER_TOKENS) expect(token.startsWith('printer.')).toBe(true);
    // learned[] is sorted then sliced at write time, so a breach would delete
    // the whole 'printer.' namespace rather than the oldest entries.
    expect(FAX_TOKENS.length + PRINTER_TOKENS.length).toBeLessThanOrEqual(BALANCE.save.maxLearnedEntries);
  });
});
