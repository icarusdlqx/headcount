import { BALANCE } from '../config/balance';
import type { Rng } from '../util/rng';
import { METER, type MeterDelta } from './meters';

/**
 * The printer, which is always jammed.
 *
 * WHERE THIS DIFFERS FROM THE FAX, which is the question that decides whether it
 * is worth building: the fax's jam is a FINE. One binary cause (wrong flap), one
 * key to clear, one flat price — it is the punishment for a decision you made
 * earlier. The printer's jam is a DIAGNOSIS. You cannot see where the paper is,
 * and finding out costs minutes. The verb is not "what does this key do" but
 * "how much information do I buy before I commit".
 *
 * THE FAIRNESS RULE, and the reason this design is shaped the way it is:
 * opening a door ALWAYS tells you whether pulling there is safe. There is no
 * hidden state, no roll behind the panel, and no way to be punished for
 * following what the machine told you. The dice choose which jam you get; they
 * never choose whether you were right. (DESIGN.md assumption 22.)
 *
 * Pure: no Phaser, no DOM.
 */

export const SEGMENTS = ['tray', 'registration', 'fuser', 'exit'] as const;
export type Segment = (typeof SEGMENTS)[number];

export const DOORS = ['A', 'B', 'C', 'D'] as const;
export type Door = (typeof DOORS)[number];

/**
 * Which doors show which segment, and from which one the leading edge is
 * reachable.
 *
 * EVERY segment has exactly one door where the edge is free and at least one
 * where it is not, so every jam is a real triage decision — no segment is a
 * formality and none is a trap. The paper path runs A -> B -> C -> D, and you can
 * always pull from the door the paper has already passed.
 */
interface SegmentView {
  /** The door where the leading edge is reachable: pull here. */
  readonly free: Door;
  /** Doors that show the paper but where pulling drags it deeper. */
  readonly snagged: readonly Door[];
}

export const SEGMENT_VIEWS: Readonly<Record<Segment, SegmentView>> = {
  tray: { free: 'A', snagged: ['B'] },
  registration: { free: 'B', snagged: ['C'] },
  fuser: { free: 'C', snagged: ['D'] },
  exit: { free: 'D', snagged: ['C'] },
};

/** One token per FACT, namespaced, exactly as the fax's nine are. */
export const PRINTER_TOKENS = [
  'printer.code.tray',
  'printer.code.registration',
  'printer.code.fuser',
  'printer.code.exit',
  'printer.diagram',
] as const;

export type PrinterPhase = 'jammed' | 'cleared' | 'shredded';

/** What opening a door tells you. This is the whole information economy. */
export type Reading = 'nothing' | 'edgeFree' | 'goesInFurther';

export interface PrinterMachine {
  phase: PrinterPhase;
  readonly segment: Segment;
  /** The door currently open, or null. Only one at a time — it is that kind of
   *  machine. */
  openDoor: Door | null;
  /** Doors opened this incident, so re-opening one is free. */
  readonly seen: Door[];
  tears: number;
  minutes: number;
  /** Tokens discovered this session, merged on close. */
  readonly discovered: string[];
  lcd: string;
}

/**
 * Built ONCE PER DAY on the director, never per session.
 *
 * If the machine were rebuilt each time the panel opened, walking out at one
 * tear and walking back in would reset the tear count — which defeats the
 * escalation, lets the Rapport penalty be re-applied, and lets the ticket be
 * re-armed indefinitely. The paper does not un-crumple because you left the room.
 */
export function createPrinter(rng: Rng, knowsCode: boolean): PrinterMachine {
  const segment = rng.pick(SEGMENTS);
  return {
    phase: 'jammed',
    segment,
    openDoor: null,
    seen: [],
    tears: 0,
    minutes: 0,
    discovered: [],
    // A player who has learned the codes is told where it is; everyone else gets
    // the code and has to find out what it means.
    lcd: knowsCode ? `at.${segment}` : `code.${segment}`,
  };
}

/** What door `door` reveals about this jam. Never hidden, never rolled. */
export function readingAt(machine: PrinterMachine, door: Door): Reading {
  const view = SEGMENT_VIEWS[machine.segment];
  if (view.free === door) return 'edgeFree';
  if (view.snagged.includes(door)) return 'goesInFurther';
  return 'nothing';
}

export interface PrinterStep {
  readonly minutes: number;
  readonly lcd: string;
  readonly learned?: string;
  readonly outcome?: PrinterOutcome;
}

export interface PrinterOutcome {
  readonly kind: 'cleared' | 'shredded' | 'abandoned';
  readonly tears: number;
  readonly minutes: number;
  readonly witnessed: boolean;
  readonly learnedNow: readonly string[];
}

function charge(machine: PrinterMachine, minutes: number): number {
  machine.minutes += minutes;
  return minutes;
}

function learn(machine: PrinterMachine, token: string): string {
  if (!machine.discovered.includes(token)) machine.discovered.push(token);
  return token;
}

/** Open a panel. Re-opening one you have already looked at this incident is
 *  free — you remember what was in there. */
export function openDoor(machine: PrinterMachine, door: Door): PrinterStep {
  if (machine.phase !== 'jammed') return { minutes: 0, lcd: machine.lcd };

  const alreadySeen = machine.seen.includes(door);
  if (!alreadySeen) machine.seen.push(door);
  machine.openDoor = door;

  const reading = readingAt(machine, door);
  machine.lcd = `read.${reading}`;

  // Panel A carries the service diagram. It is for a different model and its
  // arrows run the wrong way, which is the joke and also a real fact you learn.
  const learned = door === 'A' && !alreadySeen ? learn(machine, 'printer.diagram') : undefined;

  return {
    minutes: charge(machine, alreadySeen ? 0 : BALANCE.printer.minutes.openDoor),
    lcd: machine.lcd,
    ...(learned ? { learned } : {}),
  };
}

/**
 * Pull. The commitment key.
 *
 * You can only ever be torn by pulling at a door the machine has ALREADY told
 * you the paper goes in further at, or by pulling blind with no door open. Both
 * are decisions. That is the fairness contract.
 */
export function pull(machine: PrinterMachine, witnessed: boolean): PrinterStep {
  if (machine.phase !== 'jammed') return { minutes: 0, lcd: machine.lcd };

  // Pulling with nothing open is groping about behind the machine.
  if (machine.openDoor === null) {
    machine.tears += 1;
    machine.lcd = 'tornBlind';
    return finishTearOrShred(machine, witnessed, BALANCE.printer.minutes.tear);
  }

  const reading = readingAt(machine, machine.openDoor);

  if (reading === 'edgeFree') {
    machine.phase = 'cleared';
    machine.lcd = 'cleared';
    // Clearing it teaches what that code meant, permanently.
    const token = `printer.code.${machine.segment}`;
    learn(machine, token);
    const minutes = charge(machine, BALANCE.printer.minutes.pull);
    return {
      minutes,
      lcd: machine.lcd,
      learned: token,
      outcome: {
        kind: 'cleared',
        tears: machine.tears,
        minutes: machine.minutes,
        witnessed,
        learnedNow: machine.discovered.slice(),
      },
    };
  }

  // 'nothing' or 'goesInFurther' — both are pulling at paper you were told not
  // to pull at, or at no paper at all.
  machine.tears += 1;
  machine.lcd = reading === 'nothing' ? 'tornNothing' : 'torn';
  return finishTearOrShred(machine, witnessed, BALANCE.printer.minutes.tear);
}

function finishTearOrShred(machine: PrinterMachine, witnessed: boolean, minutes: number): PrinterStep {
  const charged = charge(machine, minutes);

  if (machine.tears >= BALANCE.printer.shredAfterTears) {
    machine.phase = 'shredded';
    machine.lcd = 'shredded';
    return {
      minutes: charged,
      lcd: machine.lcd,
      outcome: {
        kind: 'shredded',
        tears: machine.tears,
        minutes: machine.minutes,
        witnessed,
        learnedNow: machine.discovered.slice(),
      },
    };
  }

  return { minutes: charged, lcd: machine.lcd };
}

/** Walk away. The jam stays exactly as you left it, tears and all. */
export function walkAway(machine: PrinterMachine, witnessed: boolean): PrinterStep {
  const minutes = charge(machine, BALANCE.printer.minutes.abandon);
  machine.openDoor = null;
  return {
    minutes,
    lcd: 'abandoned',
    outcome: {
      kind: 'abandoned',
      tears: machine.tears,
      minutes: machine.minutes,
      witnessed,
      learnedNow: machine.discovered.slice(),
    },
  };
}

/**
 * What clearing it pays.
 *
 * ONLY RAPPORT, never Productivity. Fixing the printer is not your job and
 * nobody is counting it as work — which is the satire, and which also keeps the
 * fax the sole Output engine so a second source cannot inflate it.
 *
 * THE WITNESSED SPLIT IS THE POINT: it is worth four times as much if somebody
 * sees you do it. Fixing the printer is worth almost nothing unless you are
 * observed fixing the printer, and knowing who is in that room at what time is
 * exactly what M4's schedules and Marjorie's favour already sell you.
 */
export function printerOutcomeDeltas(outcome: PrinterOutcome, mastered: boolean): MeterDelta[] {
  const p = BALANCE.printer;
  const deltas: MeterDelta[] = [];

  if (outcome.kind === 'cleared') {
    deltas.push({
      key: METER.coworkerRep,
      delta: outcome.witnessed ? p.rapportWitnessed : p.rapportUnwitnessed,
    });
    // A clean clear on a machine you understand is the one piece of work in this
    // game that makes you feel better rather than worse.
    const strain = outcome.tears === 0 && mastered ? p.strainCleanClear : p.strainPerTear * outcome.tears;
    deltas.push({ key: METER.stress, delta: Math.min(p.strainCap, strain) });
  } else if (outcome.kind === 'shredded') {
    deltas.push({ key: METER.coworkerRep, delta: p.rapportShredded });
    deltas.push({ key: METER.stress, delta: Math.min(p.strainCap, p.strainPerTear * outcome.tears) });
  } else {
    deltas.push({ key: METER.stress, delta: Math.min(p.strainCap, p.strainPerTear * outcome.tears) });
  }

  return deltas;
}

/** True once the player can read the machine's own error codes. */
export function knowsCodeFor(learned: readonly string[], segment: Segment): boolean {
  return learned.includes(`printer.code.${segment}`);
}
