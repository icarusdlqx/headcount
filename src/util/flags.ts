/**
 * URL flags, parsed exactly once.
 *
 * Before this existed, ?debug=1 was parsed inline in one scene. M2 needs the
 * same answer in six places, and six independent URLSearchParams parses is six
 * chances for two of them to disagree about what "debug" means.
 */

export interface Flags {
  /** ?debug=1 — dev readout, the L key, and suppression of blur-pausing. */
  readonly debug: boolean;
  /** ?seed=<n|string> — pins the run seed. Its presence also means a scratch run. */
  readonly seed: string | null;
  /**
   * A pinned seed is a scratch run: nothing is loaded, nothing is saved, nothing
   * is cleared. Replaying a seed must not clobber a real week, and a real week's
   * saved seed must not override the pin.
   */
  readonly scratch: boolean;
  /** ?timescale=N — multiplies clock accumulation only. Requires ?debug=1. */
  readonly timeScale: number;
}

function parse(search: string): Flags {
  const params = new URLSearchParams(search);
  const debug = params.get('debug') === '1';
  const seed = params.get('seed');

  let timeScale = 1;
  if (debug) {
    const raw = Number(params.get('timescale'));
    // Guard the whole range: 0 stops time, negative runs it backwards, and a
    // typo of 1e9 makes the first frame consume the entire week.
    if (Number.isFinite(raw) && raw > 0 && raw <= 240) timeScale = raw;
  }

  return {
    debug,
    seed: seed !== null && seed.trim() !== '' ? seed : null,
    scratch: seed !== null && seed.trim() !== '',
    timeScale,
  };
}

export const FLAGS: Flags = parse(globalThis.location?.search ?? '');

/** Tests build their own; game code reads FLAGS. */
export const parseFlags = parse;
