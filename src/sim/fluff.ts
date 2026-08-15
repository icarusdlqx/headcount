import { BALANCE } from '../config/balance';

/**
 * Fluffing: doing something that is not work, and whether anyone notices.
 *
 * DETECTION IS A DWELL COUNTER, NEVER A DIE ROLL. Somebody who files reports has
 * to hold a clear view of what you are doing for N consecutive in-game minutes.
 * RNG picks what Dale says; it never decides your fate. Every catch therefore
 * traces back to a decision the player made and could have unmade — which is the
 * difference between tense and unfair.
 *
 * Pure: no Phaser, no DOM, no clock.
 */

export type FluffVenue = 'solitaire' | 'cooler' | 'bathroom';

export interface WatchState {
  /** Consecutive minutes a reporter has had a clear view of the offence. */
  dwell: number;
  venue: FluffVenue | null;
  /** Offences so far today, for escalation and the summary. */
  caughtToday: number;
  /**
   * True while a catch is being applied. stepWatch must return 'none' during it:
   * the catch charges minutes, charging minutes fires MINUTE events, and this
   * function runs on the MINUTE hook — so without this the catch re-enters
   * itself.
   */
  resolving: boolean;
}

export function createWatchState(): WatchState {
  return { dwell: 0, venue: null, caughtToday: 0, resolving: false };
}

export interface WatchInput {
  /** What the player is currently doing, or null for actual work. */
  readonly venue: FluffVenue | null;
  /** 0..1 — how readable your screen is to a reporter. */
  readonly screen: number;
  /** 0..1 — how visible your body is to a reporter. */
  readonly eyes: number;
  /** Who has the clearest reporting view, or null. */
  readonly watcherId: string | null;
  /** A lookout is watching your back today. */
  readonly lookout: boolean;
}

export type WatchResult =
  | { kind: 'none' }
  /** Somebody has started noticing. `remaining` is minutes before it lands. */
  | { kind: 'warn'; dwell: number; remaining: number; watcherId: string }
  | { kind: 'caught'; watcherId: string; offence: number }
  /** The lookout coughed. You have one minute of grace and they are spent. */
  | { kind: 'tipoff'; watcherId: string };

/**
 * Which channel gives you away depends on what you are doing.
 *
 * Solitaire is a SCREEN offence: someone has to be able to read your monitor,
 * which is why Dale parked beside your desk facing the other way is harmless and
 * Dale walking toward you is not. Loitering is a BODY offence — nobody needs to
 * read anything to see you standing at the cooler.
 */
function exposureFor(venue: FluffVenue, input: WatchInput): number {
  return venue === 'solitaire' ? input.screen : input.eyes;
}

/**
 * One discrete minute of being watched.
 *
 * Called from the MINUTE hook. Mutates `state` and returns what the scene should
 * show — the scene owns the prose and the panic key, this owns the arithmetic.
 */
export function stepWatch(state: WatchState, input: WatchInput): WatchResult {
  if (state.resolving) return { kind: 'none' };

  // Not doing anything you would have to explain.
  if (input.venue === null) {
    state.dwell = 0;
    state.venue = null;
    return { kind: 'none' };
  }

  // Switching offences restarts the count: a fresh crime is a fresh look.
  if (state.venue !== input.venue) {
    state.venue = input.venue;
    state.dwell = 0;
  }

  const fluff = BALANCE.fluff;
  const venue = fluff.venues[input.venue];
  const exposure = exposureFor(input.venue, input);

  if (exposure < venue.noticeAt || !input.watcherId) {
    // Attention decays rather than resetting, so pacing back and forth through
    // somebody's sightline is not a way to launder an hour of Solitaire.
    state.dwell = Math.max(0, state.dwell - fluff.dwellDecayPerMinute);
    return { kind: 'none' };
  }

  // The lookout spends itself to buy you exactly one warning, once.
  if (input.lookout && state.dwell === 0) {
    return { kind: 'tipoff', watcherId: input.watcherId };
  }

  state.dwell += 1;

  if (state.dwell >= venue.noticeMinutes) {
    state.dwell = 0;
    state.venue = null;
    state.caughtToday += 1;
    state.resolving = true;
    return { kind: 'caught', watcherId: input.watcherId, offence: state.caughtToday };
  }

  return {
    kind: 'warn',
    dwell: state.dwell,
    remaining: venue.noticeMinutes - state.dwell,
    watcherId: input.watcherId,
  };
}

/** Stress restored per minute at a venue. Negative: it takes strain away. */
export function stressDelta(venue: FluffVenue): number {
  return -BALANCE.fluff.venues[venue].stressPerMinute;
}

/**
 * Which line to use. Silence is the COMMON case on purpose: a boss who looks at
 * you, says nothing, and keeps walking is the whole joke about this office, and
 * the written lines land harder for being rare.
 */
export function catchIsSilent(offence: number, roll: number): boolean {
  if (offence >= BALANCE.fluff.alwaysSpeaksFrom) return false;
  return roll < BALANCE.fluff.silentChance;
}
