import { describe, expect, it } from 'vitest';
import { BALANCE } from '../config/balance';
import { makeRng } from '../util/rng';
import { catchIsSilent, createWatchState, stepWatch, stressDelta, type WatchInput } from './fluff';
import { canStack, deal, drawFromStock, hasAnyMove, isRed, moveToFoundation, topOf } from './solitaire';

const input = (over: Partial<WatchInput> = {}): WatchInput => ({
  venue: 'solitaire',
  screen: 1,
  eyes: 1,
  watcherId: 'dale',
  lookout: false,
  ...over,
});

describe('getting caught', () => {
  it('needs consecutive minutes of being seen, never a die roll', () => {
    // Every catch must trace back to a decision the player could have unmade.
    const state = createWatchState();
    const need = BALANCE.fluff.venues['solitaire']!.noticeMinutes;

    for (let i = 1; i < need; i++) {
      expect(stepWatch(state, input()).kind).toBe('warn');
    }
    expect(stepWatch(state, input()).kind).toBe('caught');
  });

  it('warns before it lands, with the time left', () => {
    const state = createWatchState();
    const result = stepWatch(state, input());
    if (result.kind !== 'warn') throw new Error('expected a warning first');
    expect(result.remaining).toBeGreaterThan(0);
    expect(result.watcherId).toBe('dale');
  });

  it('does not fire when the reporter is facing away — screen exposure is zero', () => {
    // Dale parks beside the desk for twenty minutes looking the other way. That
    // is the whole reason the milestone is playable.
    const state = createWatchState();
    for (let i = 0; i < 30; i++) {
      expect(stepWatch(state, input({ screen: 0, watcherId: null })).kind).toBe('none');
    }
    expect(state.dwell).toBe(0);
  });

  it('decays attention instead of resetting it', () => {
    // Otherwise pacing in and out of a sightline launders an hour of Solitaire.
    const state = createWatchState();
    stepWatch(state, input());
    const peak = state.dwell;
    stepWatch(state, input({ screen: 0, watcherId: null }));
    expect(state.dwell).toBeLessThan(peak);
    expect(state.dwell).toBeGreaterThanOrEqual(0);
  });

  it('stops counting the moment you stop', () => {
    const state = createWatchState();
    stepWatch(state, input());
    expect(stepWatch(state, input({ venue: null })).kind).toBe('none');
    expect(state.dwell).toBe(0);
  });

  it('is re-entrancy safe while a catch is being applied', () => {
    // The catch charges minutes; charging minutes fires MINUTE events; this runs
    // on the MINUTE hook. Without the guard the catch re-enters itself.
    const state = createWatchState();
    state.resolving = true;
    expect(stepWatch(state, input()).kind).toBe('none');
  });

  it('lets a lookout buy exactly one warning', () => {
    const state = createWatchState();
    expect(stepWatch(state, input({ lookout: true })).kind).toBe('tipoff');
    // Spent: the next minute counts normally.
    expect(stepWatch(state, input({ lookout: false })).kind).toBe('warn');
  });

  it('cannot catch you in the bathroom, which is the point of the bathroom', () => {
    const state = createWatchState();
    for (let i = 0; i < 60; i++) {
      expect(stepWatch(state, input({ venue: 'bathroom', eyes: 1 })).kind).toBe('none');
    }
  });
});

describe('the price of hiding', () => {
  it('pays strain back everywhere, and best where it is least convenient', () => {
    // Assumption 19's debt. The bathroom recovers fastest and costs an
    // eleven-minute round trip plus Boss Approval bleeding the whole time.
    expect(stressDelta('bathroom')).toBeLessThan(stressDelta('cooler'));
    expect(stressDelta('cooler')).toBeLessThan(0);
    expect(stressDelta('solitaire')).toBeLessThan(0);
  });
});

describe('what Dale says', () => {
  it('is usually nothing, until it keeps happening', () => {
    // A boss who looks, says nothing and walks on is the joke; the written lines
    // land harder for being rare.
    expect(catchIsSilent(1, 0.1)).toBe(true);
    expect(catchIsSilent(1, 0.99)).toBe(false);
    expect(catchIsSilent(BALANCE.fluff.alwaysSpeaksFrom, 0)).toBe(false);
  });
});

describe('solitaire', () => {
  const rng = () => makeRng(99);

  it('deals a real staircase with one card face up per pile', () => {
    const state = deal(rng());
    expect(state.piles.length).toBe(BALANCE.fluff.solitaire.piles);
    state.piles.forEach((pile, index) => {
      expect(pile.length).toBe(index + 1);
      expect(topOf(pile)!.faceUp).toBe(true);
      expect(pile.slice(0, -1).every((card) => !card.faceUp)).toBe(true);
    });
  });

  it('enforces descending rank and alternating colour', () => {
    const black = { rank: 3, suit: 0 as const, faceUp: true };
    const redFour = { rank: 4, suit: 1 as const, faceUp: true };
    const blackFour = { rank: 4, suit: 2 as const, faceUp: true };

    expect(canStack(black, redFour)).toBe(true);
    expect(canStack(black, blackFour)).toBe(false); // same colour
    expect(canStack(black, null)).toBe(true); // empty pile
    expect(isRed(1)).toBe(true);
    expect(isRed(0)).toBe(false);
  });

  it('builds foundations from the ace up, in order', () => {
    const state = deal(rng());
    // Force a known ace onto the waste.
    state.waste.push({ rank: 1, suit: 0, faceUp: true });
    expect(moveToFoundation(state, -1)).toBe(true);
    expect(state.foundations[0]).toBe(1);

    state.waste.push({ rank: 3, suit: 0, faceUp: true });
    expect(moveToFoundation(state, -1)).toBe(false); // skipped the two
  });

  it('recycles the waste when the stock runs out', () => {
    const state = deal(rng());
    let guard = 0;
    while (state.stock.length > 0 && guard++ < 100) drawFromStock(state);
    expect(state.waste.length).toBeGreaterThan(0);
    expect(drawFromStock(state)).toBe(true);
    expect(state.stock.length).toBeGreaterThan(0);
  });

  it('deals the same hand from the same seed', () => {
    const a = deal(makeRng(7));
    const b = deal(makeRng(7));
    expect(JSON.stringify(a.piles)).toBe(JSON.stringify(b.piles));
  });

  it('knows when a hand still has something in it', () => {
    expect(hasAnyMove(deal(rng()))).toBe(true);
  });
});
