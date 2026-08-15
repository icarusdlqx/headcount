import { describe, expect, it } from 'vitest';
import { BALANCE } from '../config/balance';
import { makeRng } from '../util/rng';
import {
  createMachine,
  generatePanel,
  pressDigit,
  pressFunction,
  pressStart,
  pressStop,
  setTray,
  type FaxPanel,
} from './faxMachine';
import { buildTray, faxOutcomeDeltas, foreignJamChance, productivityFor } from './faxTray';
import { METER } from './meters';

const PREFIX = BALANCE.fax.outsideLinePrefix;

function panelFor(seed: number): FaxPanel {
  return generatePanel(makeRng(seed));
}

function slotOf(panel: FaxPanel, fn: string): number {
  return panel.slots.indexOf(fn as never);
}

/** Walk the canonical mastered procedure: right tray, FEED, LINE, 9 + ext, START. */
function runCanonical(panel: FaxPanel, job: ReturnType<typeof buildTray>[number], busyRoll = 1) {
  const m = createMachine(panel, false);
  if (m.tray !== panel.faxTray) setTray(m, panel.faxTray);
  pressFunction(m, panel, slotOf(panel, 'feed'));
  pressFunction(m, panel, slotOf(panel, 'line'));
  for (const digit of PREFIX + job.extension) pressDigit(m, digit);
  return { m, step: pressStart(m, panel, job, false, busyRoll) };
}

describe('panel generation', () => {
  it('is a permutation of the six functions and is stable per seed', () => {
    const a = panelFor(1234);
    const b = panelFor(1234);
    expect(a.slots).toEqual(b.slots);
    expect(a.faxTray).toBe(b.faxTray);
    expect([...a.slots].sort()).toEqual(['copy', 'feed', 'fine', 'line', 'redial', 'speaker']);
  });

  it('puts its physical tells on real keys', () => {
    const panel = panelFor(99);
    // Day one must be deduction, not enumeration: the worn key is the one the
    // previous occupant used most, which is of course COPY.
    expect(panel.slots[panel.wornSlot]).toBe('copy');
    expect(panel.slots[panel.nearHandsetSlot]).toBe('line');
  });
});

describe('the canonical procedure', () => {
  it('sends when the prefix, the extension and the tray are all right', () => {
    const panel = panelFor(7);
    const job = buildTray(makeRng(11), 0)[0]!;
    const { step } = runCanonical(panel, job);

    expect(step.outcome?.kind).toBe('sent');
    expect(step.outcome?.jams).toBe(0);
    // 26 in-game minutes for a mastered job: base 14 + tray/feed/line/start + transmit.
    expect(step.outcome?.minutes).toBeLessThanOrEqual(30);
  });

  it('misdials — and still transmits — without the 9', () => {
    const panel = panelFor(7);
    const job = buildTray(makeRng(11), 0)[0]!;
    const m = createMachine(panel, false);
    if (m.tray !== panel.faxTray) setTray(m, panel.faxTray);
    pressFunction(m, panel, slotOf(panel, 'feed'));
    pressFunction(m, panel, slotOf(panel, 'line'));
    // Four digits straight off the cover sheet, which never mentions a 9.
    for (const digit of job.extension) pressDigit(m, digit);
    pressDigit(m, '0');
    const step = pressStart(m, panel, job, false, 1);

    // The transmission SUCCEEDS. You feel great. The bill arrives later.
    expect(step.outcome?.kind).toBe('misdialed');
  });

  it('jams on the wrong tray, and a jam teaches which tray', () => {
    const panel = panelFor(7);
    const job = buildTray(makeRng(11), 0)[0]!;
    const m = createMachine(panel, false);
    setTray(m, panel.faxTray === 0 ? 1 : 0);
    pressFunction(m, panel, slotOf(panel, 'feed'));
    pressFunction(m, panel, slotOf(panel, 'line'));
    for (const digit of PREFIX + job.extension) pressDigit(m, digit);
    const step = pressStart(m, panel, job, false, 1);

    expect(m.phase).toBe('jammed');
    expect(step.outcome).toBeUndefined();
    expect(step.learned).toBe('fax.tray');
  });
});

describe('press rules', () => {
  it('charges nothing for digits, so only decisions cost time', () => {
    const panel = panelFor(3);
    const m = createMachine(panel, false);
    pressFunction(m, panel, slotOf(panel, 'line'));
    const before = m.minutes;
    pressDigit(m, '9');
    pressDigit(m, '1');
    expect(m.minutes).toBe(before);
  });

  it('refuses digits with no line, and a full buffer is not a mistake', () => {
    const panel = panelFor(3);
    const m = createMachine(panel, false);
    pressDigit(m, '9');
    expect(m.wrongPresses).toBe(1);

    pressFunction(m, panel, slotOf(panel, 'line'));
    for (const digit of '912345678') pressDigit(m, digit);
    expect(m.digits.length).toBe(1 + BALANCE.fax.extensionDigits);
    // Overflow presses do not count against the player.
    expect(m.wrongPresses).toBe(1);
  });

  it('lets STOP out from anywhere, including a jam', () => {
    const panel = panelFor(5);
    const job = buildTray(makeRng(2), 0)[0]!;
    const m = createMachine(panel, true);
    expect(m.phase).toBe('jammed');
    const step = pressStop(m, job, false);
    expect(step.outcome?.kind).toBe('abandoned');
    expect(step.outcome?.jamLeftOpen).toBe(true);
  });
});

describe('the busy signal', () => {
  it('blocks the send once, and REDIAL is what gets you through', () => {
    const panel = panelFor(21);
    const job = buildTray(makeRng(31), 0)[0]!;
    // A roll below the chance means the far end is engaged.
    const { m, step } = runCanonical(panel, job, 0);

    expect(step.outcome).toBeUndefined();
    expect(m.busyPending).toBe(true);
    expect(m.digits).toBe('');

    // The key that is useless every other day is exactly right now.
    const redial = pressFunction(m, panel, slotOf(panel, 'redial'));
    expect(redial.progress).toBe(true);
    expect(m.digits).toBe(PREFIX + job.extension);

    const retry = pressStart(m, panel, job, false, 0);
    expect(retry.outcome?.kind).toBe('sent');
  });
});

describe('the tray economy', () => {
  it('never generates an extension that would make a misdial correct', () => {
    for (let seed = 0; seed < 40; seed++) {
      for (const job of buildTray(makeRng(seed), seed)) {
        expect(job.extension.startsWith(PREFIX)).toBe(false);
        expect(job.extension).toHaveLength(BALANCE.fax.extensionDigits);
      }
    }
  });

  it('is identical for the same day and seed, so an abandoned day replays', () => {
    expect(buildTray(makeRng(77), 3)).toEqual(buildTray(makeRng(77), 3));
  });

  it('pays every job something, with diminishing returns', () => {
    const first = productivityFor('yours', 0, false, false);
    const fifth = productivityFor('yours', 4, false, false);
    expect(first).toBe(BALANCE.fax.productivityPerJob);
    expect(fifth).toBeLessThan(first);
    expect(fifth).toBeGreaterThan(0);
    // A colleague's paper is worth less to you, but never nothing, or nobody
    // would ever take one.
    expect(productivityFor('colleague', 0, false, false)).toBeLessThan(first);
    expect(productivityFor('colleague', 0, false, false)).toBeGreaterThan(0);
  });

  it('moves two meters in opposite directions for every non-yours job', () => {
    const base = {
      jobId: 'j',
      minutes: 26,
      jams: 0,
      copies: 0,
      wrongPresses: 0,
      fine: false,
      speakerUsed: false,
      creased: false,
      jamLeftOpen: false,
      degraded: false,
      learnedNow: [],
    } as const;

    const boss = faxOutcomeDeltas({ ...base, kind: 'sent', owner: 'boss' }, 0, false);
    const colleague = faxOutcomeDeltas({ ...base, kind: 'sent', owner: 'colleague' }, 0, false);

    const find = (list: typeof boss, key: string) => list.find((d) => d.key === key)?.delta ?? 0;

    // THE critical design rule: opposite signs, every time.
    expect(find(boss, METER.bossApproval)).toBeGreaterThan(0);
    expect(find(boss, METER.coworkerRep)).toBeLessThan(0);
    expect(find(colleague, METER.bossApproval)).toBeLessThan(0);
    expect(find(colleague, METER.coworkerRep)).toBeGreaterThan(0);
  });

  it('caps the stress a single job can inflict', () => {
    const outcome = {
      kind: 'sent',
      owner: 'yours',
      jobId: 'j',
      minutes: 200,
      jams: 9,
      copies: 4,
      wrongPresses: 40,
      fine: false,
      speakerUsed: false,
      creased: true,
      jamLeftOpen: false,
      degraded: false,
      learnedNow: [],
    } as const;
    const stress = faxOutcomeDeltas(outcome, 0, false).find((d) => d.key === METER.stress)?.delta ?? 0;
    // Without the cap, a fumbling player pins at 100 by lunch on Monday and the
    // degradation tiers compound into a death spiral.
    expect(stress).toBeLessThanOrEqual(BALANCE.fax.stressCapPerJob);
  });
});

describe('coworker rep has teeth at M3', () => {
  it('makes the machine more likely to be left jammed for you', () => {
    // The only mechanical consequence Coworker Rep has this milestone. Without
    // it, "never take a colleague's job" strictly dominates.
    expect(foreignJamChance(0)).toBeGreaterThan(foreignJamChance(100));
    expect(foreignJamChance(100)).toBeGreaterThanOrEqual(0);
    expect(foreignJamChance(0)).toBeLessThanOrEqual(1);
  });
});
