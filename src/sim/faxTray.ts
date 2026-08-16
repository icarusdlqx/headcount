import { BALANCE } from '../config/balance';
import type { Rng } from '../util/rng';
import type { FaxOutcome } from './faxMachine';
import { METER, type MeterDelta } from './meters';

/**
 * The day's work, and its economics.
 *
 * EVERY FAX JOB IS SOMEBODY'S PAPER. That is the cheapest honest answer to
 * "why isn't the dominant strategy just always fax": the tray is a scarce
 * resource allocated across three meters under a time budget, so every job is a
 * two-meter decision and no ordering is free. It costs one JSON file and one
 * union type, and it needs no NPCs.
 *
 * The colleague names here become M4's NPC ids, so the day Steve arrives,
 * flags['favor.steve'] can be credited with no change to this economy.
 */

export type JobOwner = 'yours' | 'boss' | 'colleague';

export interface FaxJob {
  readonly id: string;
  readonly owner: JobOwner;
  /** A stable id, resolved to prose by the view. Identity keys live with the
   *  code so a writer adding a name cannot reshuffle a replayed day. */
  readonly recipientId: string;
  readonly colleagueId: string | null;
  /** Exactly extensionDigits digits, with NO prefix. The 9 is the player's job. */
  readonly extension: string;
  /** Seeded per job, consumed by pressStart. Fixed in advance so no amount of
   *  retrying can reroll it. */
  readonly busyRoll: number;
  readonly coverLineIndex: number;
}

/** Re-exported for the callers that already import it from here. */
export type { MeterDelta } from './meters';

/** Stable identity keys. Display names live in fax.json, keyed by these. */
export const RECIPIENT_IDS = ['regional', 'accounts', 'legal', 'warehouse', 'vendor', 'branch'] as const;
export const COLLEAGUE_IDS = ['steve', 'marjorie', 'dennis', 'pat'] as const;

/**
 * The tray is rebuilt from the seed on every beginDay and never persisted —
 * nothing to migrate, and an abandoned day regenerates identical jobs.
 */
export function buildTray(rng: Rng, dayIndex: number): FaxJob[] {
  const count = rng.int(BALANCE.fax.trayMin, BALANCE.fax.trayMax);
  const jobs: FaxJob[] = [];

  for (let index = 0; index < count; index++) {
    const owner = pickOwner(rng);
    jobs.push({
      id: `d${dayIndex}:${index}`,
      owner,
      recipientId: rng.pick(RECIPIENT_IDS),
      colleagueId: owner === 'colleague' ? rng.pick(COLLEAGUE_IDS) : null,
      extension: makeExtension(rng),
      busyRoll: rng.next(),
      coverLineIndex: rng.int(0, 999),
    });
  }
  return jobs;
}

function pickOwner(rng: Rng): JobOwner {
  const weights = BALANCE.fax.ownerWeights;
  const total = weights.yours + weights.boss + weights.colleague;
  const roll = rng.next() * total;
  if (roll < weights.yours) return 'yours';
  if (roll < weights.yours + weights.boss) return 'boss';
  return 'colleague';
}

/** The first digit is never the outside-line prefix, so a misdial can never
 *  accidentally be correct. */
function makeExtension(rng: Rng): string {
  const prefix = BALANCE.fax.outsideLinePrefix;
  let first = String(rng.int(1, 9));
  while (first === prefix) first = String(rng.int(1, 9));

  let out = first;
  for (let i = 1; i < BALANCE.fax.extensionDigits; i++) out += String(rng.int(0, 9));
  return out;
}

/**
 * Every job pays SOME productivity, so faxing is never pointless and the player
 * is never punished for working. Diminishing returns are what make the fifth job
 * a real question rather than an obligation.
 */
export function productivityFor(owner: JobOwner, sentToday: number, fine: boolean, creased: boolean): number {
  const base = owner === 'colleague' ? BALANCE.fax.productivityPerColleagueJob : BALANCE.fax.productivityPerJob;
  const diminished = base * Math.pow(BALANCE.fax.productivityDiminish, Math.max(0, sentToday));
  const fined = diminished * (fine ? BALANCE.fax.productivityFineMultiplier : 1);
  return fined * (creased ? BALANCE.fax.productivityCreasedMultiplier : 1);
}

/**
 * The two-meter table, in one place:
 *
 *   yours      Productivity +30*d
 *   boss       Productivity +30*d   Boss +6   Coworker -9
 *   colleague  Productivity +18*d   Boss -4   Coworker +10
 *
 * The colleague row is structurally DESIGN.md's "Cover for Steve" — Coworker Rep
 * up, Productivity down — arriving a milestone before Steve does.
 */
export function faxOutcomeDeltas(
  outcome: FaxOutcome,
  sentToday: number,
  speakerAlreadyChargedToday: boolean,
): MeterDelta[] {
  const deltas: MeterDelta[] = [];
  const fax = BALANCE.fax;

  const wrongPressStress =
    outcome.wrongPresses *
    fax.stressPerWrongPress *
    (outcome.degraded ? fax.wrongPressStressMultiplierWhenDegraded : 1);

  if (outcome.kind === 'sent') {
    deltas.push({
      key: METER.productivity,
      delta: productivityFor(outcome.owner, sentToday, outcome.fine, outcome.creased),
    });
    if (outcome.owner === 'boss') {
      deltas.push({ key: METER.bossApproval, delta: fax.bossApprovalPerBossJob });
      deltas.push({ key: METER.coworkerRep, delta: fax.coworkerRepPerBossJob });
    } else if (outcome.owner === 'colleague') {
      deltas.push({ key: METER.bossApproval, delta: fax.bossApprovalPerColleagueJob });
      deltas.push({ key: METER.coworkerRep, delta: fax.coworkerRepPerColleagueJob });
    }
  }

  if (outcome.kind === 'abandoned') {
    deltas.push({ key: METER.stress, delta: fax.stressPerAbandon });
    if (outcome.jamLeftOpen) {
      deltas.push({ key: METER.coworkerRep, delta: fax.coworkerRepPerJamLeftOpen });
    }
  } else {
    const stress = Math.min(
      fax.stressCapPerJob,
      fax.stressPerJobStarted + wrongPressStress + outcome.jams * fax.stressPerJam + fax.stressPerJobSent,
    );
    deltas.push({ key: METER.stress, delta: stress });
  }

  if (outcome.speakerUsed && !speakerAlreadyChargedToday) {
    deltas.push({ key: METER.coworkerRep, delta: fax.coworkerRepPerSpeakerDay });
  }

  return deltas;
}

/** Lands 25-70 in-game minutes after a misdial, back at your desk. All of a
 *  misdial's reputational cost is here rather than at the machine, because the
 *  point is that you walked away feeling good. */
export function misdialReplyDeltas(): MeterDelta[] {
  return [
    { key: METER.coworkerRep, delta: BALANCE.fax.coworkerRepPerMisdial },
    { key: METER.stress, delta: 3 },
  ];
}

/**
 * How likely the machine is already jammed when you arrive, and it is not your
 * jam. This is Coworker Rep's only mechanical consequence at M3: when people
 * like you they clear the machine, and when they do not, they leave it for you.
 * Without it, "never take a colleague's job" strictly dominates, because Coworker
 * Rep would be a number with no teeth until M4.
 */
export function foreignJamChance(coworkerRep: number): number {
  const fax = BALANCE.fax;
  const t = Math.min(1, Math.max(0, coworkerRep / BALANCE.meters.max));
  return fax.foreignJamChanceAtZeroRep + (fax.foreignJamChanceAtFullRep - fax.foreignJamChanceAtZeroRep) * t;
}
