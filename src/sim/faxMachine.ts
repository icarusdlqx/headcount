import { BALANCE } from '../config/balance';
import type { Rng } from '../util/rng';
import type { FaxJob, JobOwner } from './faxTray';

/**
 * The OMNITEL FX-220, as a pure state machine.
 *
 * The design in one line: six unlabeled keys, a legible keypad, two identical
 * paper trays and a 16-character LCD that explains nothing. The player learns the
 * machine by breaking it, and every fact they learn gets stuck to it as a
 * label-maker strip that persists forever.
 *
 * No Phaser, no DOM, no wall clock — the scene renders what this returns.
 */

export const FAX_FUNCTIONS = ['line', 'feed', 'fine', 'copy', 'redial', 'speaker'] as const;
export type FaxFunction = (typeof FAX_FUNCTIONS)[number];

/** One token per FACT, never per event, always namespaced. M6's printer set gets
 *  `printer.`. Nine tokens plus that leaves the save's 128-entry cap unreachable. */
export const FAX_TOKENS = [
  'fax.key.line',
  'fax.key.feed',
  'fax.key.fine',
  'fax.key.copy',
  'fax.key.redial',
  'fax.key.speaker',
  'fax.tray',
  'fax.prefix',
  'fax.jam',
] as const;

export interface FaxPanel {
  /** slots[i] is the function of the i-th physical key, left-to-right then top-to
   *  -bottom of the 2x3 block. A permutation of FAX_FUNCTIONS. */
  readonly slots: readonly FaxFunction[];
  /** Which flap is the fax tray. The other one jams. */
  readonly faxTray: 0 | 1;
  /**
   * Physical tells, so day one is deduction rather than enumeration. Six
   * identical blank keys is a six-tumbler lock; real 1994 equipment lets you
   * reason — the key nearest the handset is the line key, the most worn key is
   * the one everyone presses. These are HINTS, not labels: `wear` marks the key
   * most used by the previous occupant (copy, of course), and `nearHandset`
   * marks the one beside the receiver.
   */
  readonly wornSlot: number;
  readonly nearHandsetSlot: number;
}

/**
 * The panel is generated per RUN, not per day — channel `fax:panel:v1`, no day
 * index. The machine is identical Monday through Friday, week after week, which
 * is what makes a learned label mean anything on Thursday.
 *
 * The `:v1` suffix is the escape hatch: bump it and every run gets a new machine,
 * which reads in-fiction as "the fax was replaced" rather than as a bug. It is
 * the only sanctioned way to invalidate mastery later.
 */
export function generatePanel(rng: Rng): FaxPanel {
  const slots = rng.shuffle(FAX_FUNCTIONS as readonly FaxFunction[]);
  return {
    slots,
    faxTray: rng.int(0, 1) as 0 | 1,
    // The previous occupant pressed COPY more than anything else. So will you.
    wornSlot: slots.indexOf('copy'),
    nearHandsetSlot: slots.indexOf('line'),
  };
}

export type FaxPhase = 'idle' | 'jammed' | 'done';

export interface FaxLcd {
  /** A key into fax.json lcd.terse / lcd.verbose. Never rendered prose. */
  readonly code: string;
  readonly vars: Readonly<Record<string, string | number>>;
}

export interface FaxMachine {
  phase: FaxPhase;
  tray: 0 | 1;
  fed: boolean;
  line: boolean;
  /** Digits typed since the line was seized, including any prefix. */
  digits: string;
  fine: boolean;
  speaker: boolean;
  jams: number;
  creased: boolean;
  copies: number;
  wrongPresses: number;
  /** Whole in-game minutes charged so far this session. */
  minutes: number;
  /** The last number dialled today, for REDIAL. */
  lastNumber: string;
  /** True once a send has failed busy and not yet been retried. */
  busyPending: boolean;
  /** Tokens discovered THIS session, not yet merged into RunState.learned. */
  discovered: string[];
  lcd: FaxLcd;
}

export type FaxCue = 'feed' | 'tray' | 'copy' | 'crumple' | 'eject' | 'dial' | 'send' | 'busy' | 'reject';

export interface FaxOutcome {
  readonly kind: 'sent' | 'misdialed' | 'abandoned';
  readonly jobId: string;
  readonly owner: JobOwner;
  readonly minutes: number;
  readonly jams: number;
  readonly copies: number;
  readonly wrongPresses: number;
  readonly fine: boolean;
  readonly speakerUsed: boolean;
  readonly creased: boolean;
  readonly jamLeftOpen: boolean;
  readonly degraded: boolean;
  readonly learnedNow: readonly string[];
}

export interface FaxStep {
  readonly minutes: number;
  readonly lcd: FaxLcd;
  readonly learned?: string;
  readonly cue?: FaxCue;
  /** True when the press advanced the procedure. Rendered as a confirmation
   *  flash, which stress tier 2 and above suppresses. */
  readonly progress: boolean;
  readonly outcome?: FaxOutcome;
}

const M = BALANCE.fax.minutes;

function lcd(code: string, vars: Record<string, string | number> = {}): FaxLcd {
  return { code, vars };
}

function charge(machine: FaxMachine, minutes: number): number {
  machine.minutes += minutes;
  return minutes;
}

function learn(machine: FaxMachine, token: string): string {
  if (!machine.discovered.includes(token)) machine.discovered.push(token);
  return token;
}

export function createMachine(panel: FaxPanel, jamOnArrival: boolean): FaxMachine {
  return {
    phase: jamOnArrival ? 'jammed' : 'idle',
    // Whichever flap was left selected. Not helpfully pre-set to the right one.
    tray: panel.faxTray === 0 ? 1 : 0,
    fed: false,
    line: false,
    digits: '',
    fine: false,
    speaker: false,
    jams: 0,
    creased: false,
    copies: 0,
    wrongPresses: 0,
    minutes: 0,
    lastNumber: '',
    busyPending: false,
    discovered: [],
    lcd: jamOnArrival ? lcd('jamForeign') : lcd('ready'),
  };
}

export function setTray(machine: FaxMachine, tray: 0 | 1): FaxStep {
  machine.tray = tray;
  machine.lcd = lcd('checkTray', { n: tray + 1 });
  return { minutes: charge(machine, M.tray), lcd: machine.lcd, cue: 'tray', progress: false };
}

/** A wrong press never no-ops with a buzz. It always does something physical, it
 *  costs time and not progress, and the machine never says "wrong" — it says E-04.
 *  The player supplies the swearing. */
export function pressFunction(machine: FaxMachine, panel: FaxPanel, slot: number): FaxStep {
  const fn = panel.slots[slot];
  if (!fn || machine.phase !== 'idle') {
    machine.lcd = lcd('jam');
    return { minutes: 0, lcd: machine.lcd, progress: false };
  }

  switch (fn) {
    case 'line': {
      if (machine.line) {
        machine.wrongPresses++;
        machine.lcd = lcd('alreadyLine');
        return { minutes: charge(machine, M.press), lcd: machine.lcd, progress: false };
      }
      machine.line = true;
      machine.lcd = lcd('lineOk');
      return {
        minutes: charge(machine, M.press),
        lcd: machine.lcd,
        learned: learn(machine, 'fax.key.line'),
        progress: true,
      };
    }
    case 'feed': {
      if (machine.fed) {
        machine.wrongPresses++;
        machine.lcd = lcd('docLoaded', { n: 1 });
        return { minutes: charge(machine, M.press), lcd: machine.lcd, progress: false };
      }
      machine.fed = true;
      machine.lcd = lcd('docLoaded', { n: 1 });
      return {
        minutes: charge(machine, M.press),
        lcd: machine.lcd,
        cue: 'feed',
        learned: learn(machine, 'fax.key.feed'),
        progress: true,
      };
    }
    case 'fine': {
      machine.fine = !machine.fine;
      machine.lcd = lcd(machine.fine ? 'fineOn' : 'fineOff');
      return {
        minutes: charge(machine, M.press),
        lcd: machine.lcd,
        learned: learn(machine, 'fax.key.fine'),
        progress: false,
      };
    }
    case 'copy': {
      // The comic trap. It is the button everyone presses first, it does
      // something loud and physical, and it teaches nothing. By Thursday there
      // are nine warm grey sheets stacked in the output tray. Nobody mentions it.
      if (!machine.fed) {
        machine.wrongPresses++;
        machine.lcd = lcd('noDoc');
        return { minutes: charge(machine, M.press), lcd: machine.lcd, progress: false };
      }
      machine.copies++;
      machine.lcd = lcd('copying', { n: machine.copies });
      return {
        minutes: charge(machine, M.press + M.copy),
        lcd: machine.lcd,
        cue: 'copy',
        learned: learn(machine, 'fax.key.copy'),
        progress: false,
      };
    }
    case 'redial': {
      if (!machine.line) {
        machine.wrongPresses++;
        machine.lcd = lcd('noLine');
        return { minutes: charge(machine, M.press), lcd: machine.lcd, progress: false };
      }
      if (machine.lastNumber === '') {
        machine.lcd = lcd('redialEmpty');
        return { minutes: charge(machine, M.press), lcd: machine.lcd, progress: false };
      }
      machine.digits = machine.lastNumber;
      machine.lcd = lcd('dialing', { digits: formatDigits(machine.digits) });
      return {
        minutes: charge(machine, M.press + M.redial),
        lcd: machine.lcd,
        cue: 'dial',
        learned: learn(machine, 'fax.key.redial'),
        // Redial after a busy signal is exactly right, and it is the only time
        // this key is worth anything.
        progress: machine.busyPending,
      };
    }
    case 'speaker': {
      // The critical design rule operating INSIDE the minigame: materially
      // easier to read, and the whole floor hears you fail for eight hours.
      machine.speaker = !machine.speaker;
      machine.lcd = lcd(machine.speaker ? 'speakerOn' : 'speakerOff');
      return {
        minutes: charge(machine, M.press),
        lcd: machine.lcd,
        learned: learn(machine, 'fax.key.speaker'),
        progress: false,
      };
    }
    default:
      return { minutes: 0, lcd: machine.lcd, progress: false };
  }
}

export function pressDigit(machine: FaxMachine, digit: string): FaxStep {
  if (machine.phase !== 'idle') return { minutes: 0, lcd: machine.lcd, progress: false };

  if (!machine.line) {
    machine.wrongPresses++;
    machine.lcd = lcd('noLine');
    // Zero minutes: pressing a number at a dead machine is not a decision.
    return { minutes: 0, lcd: machine.lcd, progress: false };
  }
  if (machine.digits.length >= 1 + BALANCE.fax.extensionDigits) {
    // A full buffer is not a mistake, so it costs nothing and counts nothing.
    return { minutes: 0, lcd: machine.lcd, progress: false };
  }
  machine.digits += digit;
  machine.lcd = lcd('dialing', { digits: formatDigits(machine.digits) });
  return { minutes: charge(machine, M.digit), lcd: machine.lcd, cue: 'dial', progress: true };
}

/** `9-4417` — the dash appears only once a prefix and an extension both exist. */
function formatDigits(digits: string): string {
  if (digits.length <= 1) return digits;
  return `${digits.slice(0, 1)}-${digits.slice(1)}`;
}

export function pressStart(
  machine: FaxMachine,
  panel: FaxPanel,
  job: FaxJob,
  degraded: boolean,
  busyRoll: number,
): FaxStep {
  if (machine.phase !== 'idle') return { minutes: 0, lcd: machine.lcd, progress: false };

  // Checked in this exact order, so the machine complains about the most
  // physical problem first.
  if (!machine.fed) {
    machine.wrongPresses++;
    machine.lcd = lcd('noDoc');
    return { minutes: charge(machine, M.start), lcd: machine.lcd, progress: false };
  }
  if (!machine.line) {
    machine.wrongPresses++;
    machine.lcd = lcd('noLine');
    return { minutes: charge(machine, M.start), lcd: machine.lcd, progress: false };
  }
  if (machine.digits.length < 1 + BALANCE.fax.extensionDigits) {
    machine.wrongPresses++;
    machine.lcd = lcd('noNumber');
    return { minutes: charge(machine, M.start), lcd: machine.lcd, progress: false };
  }

  // Wrong flap: JAM. Costs time and stress, never Productivity — you did not
  // un-do work, you made the job take longer. That distinction is the whole
  // "funny, not punishing" bar.
  if (machine.tray !== panel.faxTray) {
    machine.phase = 'jammed';
    machine.jams++;
    machine.lcd = lcd(machine.jams >= BALANCE.fax.hintAfterJams ? 'jamHint' : 'jam');
    return {
      minutes: charge(machine, M.start + M.jam),
      lcd: machine.lcd,
      cue: 'crumple',
      // A jam proves which flap is not the fax tray, and there are only two.
      learned: learn(machine, 'fax.tray'),
      progress: false,
    };
  }

  machine.lastNumber = machine.digits;

  // Engaged. The per-job uncertainty that keeps a mastered fax a decision:
  // REDIAL stops being the useless key exactly when you have mastered
  // everything else.
  if (!machine.busyPending && busyRoll < BALANCE.fax.busyChance) {
    machine.busyPending = true;
    machine.digits = '';
    machine.wrongPresses = Math.max(0, machine.wrongPresses); // a busy line is not your fault
    machine.lcd = lcd('busy');
    return { minutes: charge(machine, M.start), lcd: machine.lcd, cue: 'busy', progress: false };
  }

  machine.phase = 'done';
  machine.busyPending = false;
  const transmit = machine.fine ? M.transmitFine : M.transmit;
  const minutes = charge(machine, M.start + transmit);
  // A success proves the tray too.
  learn(machine, 'fax.tray');

  const dialledCorrectly = machine.digits === BALANCE.fax.outsideLinePrefix + job.extension;
  machine.lcd = lcd('ok');

  return {
    minutes,
    lcd: machine.lcd,
    cue: 'send',
    learned: 'fax.tray',
    progress: true,
    outcome: {
      // The transmission SUCCEEDS either way. You feel great. The consequence
      // of a misdial arrives forty minutes later, back at your desk.
      kind: dialledCorrectly ? 'sent' : 'misdialed',
      jobId: job.id,
      owner: job.owner,
      minutes: machine.minutes,
      jams: machine.jams,
      copies: machine.copies,
      wrongPresses: machine.wrongPresses,
      fine: machine.fine,
      speakerUsed: machine.speaker,
      creased: machine.creased,
      jamLeftOpen: false,
      degraded,
      learnedNow: machine.discovered.slice(),
    },
  };
}

/** The tray is NOT auto-corrected: a player who has not learned flips the same
 *  flap and jams again. That is the lesson. */
export function clearJam(machine: FaxMachine, foreign: boolean): FaxStep {
  machine.phase = 'idle';
  machine.fed = false;
  machine.creased = !foreign;
  machine.lcd = lcd('ready');
  return {
    minutes: charge(machine, foreign ? M.foreignJam : M.clearJam),
    lcd: machine.lcd,
    cue: 'eject',
    learned: foreign ? undefined : learn(machine, 'fax.jam'),
    progress: true,
  };
}

/** Always available, including while jammed. There is no way to be stuck. */
export function pressStop(machine: FaxMachine, job: FaxJob, degraded: boolean): FaxStep {
  const jamLeftOpen = machine.phase === 'jammed';
  machine.phase = 'done';
  machine.lcd = lcd('cancelled');
  const minutes = charge(machine, M.abandon);
  return {
    minutes,
    lcd: machine.lcd,
    cue: 'reject',
    progress: false,
    outcome: {
      kind: 'abandoned',
      jobId: job.id,
      owner: job.owner,
      minutes: machine.minutes,
      jams: machine.jams,
      copies: machine.copies,
      wrongPresses: machine.wrongPresses,
      fine: machine.fine,
      speakerUsed: machine.speaker,
      creased: machine.creased,
      jamLeftOpen,
      degraded,
      learnedNow: machine.discovered.slice(),
    },
  };
}

export function isLearned(learned: readonly string[], token: string): boolean {
  return learned.includes(token);
}

/** Which slots the player can read a label on. The generator supplies WHAT they
 *  know; the save records only THAT they know. */
export function labelForSlot(panel: FaxPanel, slot: number, learned: readonly string[]): FaxFunction | null {
  const fn = panel.slots[slot];
  if (!fn) return null;
  return isLearned(learned, `fax.key.${fn}`) ? fn : null;
}
