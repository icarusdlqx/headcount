/**
 * Deterministic RNG. Every random thing in HEADCOUNT — daily events, jam
 * locations, which memo contradicts which — pulls from a seeded stream so a
 * designer can replay an exact day with ?seed=<n>.
 *
 * Never call Math.random() in game code. If you need chaos, make a stream.
 */

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Float in [min, max). */
  float(min: number, max: number): number;
  /** True with probability p. */
  chance(p: number): boolean;
  /** Uniform pick. Throws on an empty list rather than returning undefined. */
  pick<T>(items: readonly T[]): T;
  /** Fisher-Yates, returns a new array. */
  shuffle<T>(items: readonly T[]): T[];
  readonly seed: number;
}

/** mulberry32 — small, fast, good enough for office politics. */
export function makeRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    seed,
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    float: (min, max) => min + next() * (max - min),
    chance: (p) => next() < p,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('rng.pick: empty list');
      return items[Math.floor(next() * items.length)]!;
    },
    shuffle<T>(items: readonly T[]): T[] {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
  };
}

/** Stable 32-bit hash, for deriving per-day or per-system seeds from a string. */
export function hashSeed(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * The run seed. `?seed=1234` pins it; otherwise it is derived from the calendar
 * date so a given day plays the same for everyone, which makes bug reports
 * ("Tuesday, the fax exploded") reproducible.
 */
export function resolveRunSeed(search: string = globalThis.location?.search ?? ''): number {
  const param = new URLSearchParams(search).get('seed');
  if (param !== null && param.trim() !== '') {
    const parsed = Number(param);
    if (Number.isFinite(parsed)) return Math.floor(parsed) >>> 0;
    return hashSeed(param);
  }
  return hashSeed(new Date().toISOString().slice(0, 10));
}
