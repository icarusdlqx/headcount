import { BALANCE } from '../config/balance';
import type { Rng } from '../util/rng';

/**
 * The card game you are not supposed to be playing.
 *
 * A CUT-DOWN Klondike: four suits of six ranks, four tableau piles, one stock.
 * Full 52-card Klondike is roughly the size of the fax machine, which was an
 * entire milestone, and nothing here depends on it — the tension comes from the
 * clock and the man in the aisle, not from whether the red nine goes on the
 * black ten. Twenty-four cards is small enough to win in a few minutes and real
 * enough that winning means something.
 *
 * Pure: no Phaser, no DOM. The board renders whatever this says.
 */

export type Suit = 0 | 1 | 2 | 3;

export interface Card {
  /** 1..ranksPerSuit. 1 is the ace. */
  readonly rank: number;
  readonly suit: Suit;
  faceUp: boolean;
}

/** Spades and clubs are black; hearts and diamonds red. Alternating colour is
 *  the only rule that makes a tableau a puzzle rather than a sort. */
export function isRed(suit: Suit): boolean {
  return suit === 1 || suit === 3;
}

export interface SolitaireState {
  /** Tableau piles, bottom first. Only the last card of each is face up. */
  readonly piles: Card[][];
  /** Face-down draw pile. */
  readonly stock: Card[];
  /** Face-up discard; only the top card is playable. */
  readonly waste: Card[];
  /** One per suit, holding the next rank required (0 = empty). */
  readonly foundations: number[];
  moves: number;
  won: boolean;
}

export function deal(rng: Rng): SolitaireState {
  const { suits, ranksPerSuit, piles: pileCount } = BALANCE.fluff.solitaire;

  const deck: Card[] = [];
  for (let suit = 0; suit < suits; suit++) {
    for (let rank = 1; rank <= ranksPerSuit; rank++) {
      deck.push({ rank, suit: suit as Suit, faceUp: false });
    }
  }

  const shuffled = rng.shuffle(deck);
  const piles: Card[][] = [];
  let index = 0;
  // Classic staircase: pile n gets n+1 cards, last one face up.
  for (let p = 0; p < pileCount; p++) {
    const pile: Card[] = [];
    for (let c = 0; c <= p && index < shuffled.length; c++) {
      pile.push({ ...shuffled[index++]!, faceUp: c === p });
    }
    piles.push(pile);
  }

  return {
    piles,
    stock: shuffled.slice(index).map((card) => ({ ...card, faceUp: false })),
    waste: [],
    foundations: new Array(suits).fill(0),
    moves: 0,
    won: false,
  };
}

export function topOf(pile: Card[]): Card | null {
  return pile[pile.length - 1] ?? null;
}

/** Descending rank, alternating colour — the tableau rule. */
export function canStack(moving: Card, onto: Card | null): boolean {
  if (onto === null) return true; // an empty pile takes anything
  if (!onto.faceUp) return false;
  return onto.rank === moving.rank + 1 && isRed(onto.suit) !== isRed(moving.suit);
}

export function canFoundation(state: SolitaireState, card: Card): boolean {
  return state.foundations[card.suit] === card.rank - 1;
}

/** Turn one from the stock, recycling the waste when it runs dry. */
export function drawFromStock(state: SolitaireState): boolean {
  if (state.stock.length === 0) {
    if (state.waste.length === 0) return false;
    while (state.waste.length > 0) {
      const card = state.waste.pop()!;
      card.faceUp = false;
      state.stock.push(card);
    }
    state.moves++;
    return true;
  }
  const card = state.stock.pop()!;
  card.faceUp = true;
  state.waste.push(card);
  state.moves++;
  return true;
}

/** The playable card from a source: the waste top, or a pile's top. */
function takeFrom(state: SolitaireState, source: number): Card | null {
  if (source < 0) return topOf(state.waste);
  return topOf(state.piles[source] ?? []);
}

function removeFrom(state: SolitaireState, source: number): void {
  if (source < 0) {
    state.waste.pop();
    return;
  }
  const pile = state.piles[source];
  if (!pile) return;
  pile.pop();
  // Expose whatever was underneath — the small dopamine of the whole genre.
  const next = topOf(pile);
  if (next) next.faceUp = true;
}

/** source: -1 = waste, 0..n = pile. target: 0..n = pile. */
export function moveToPile(state: SolitaireState, source: number, target: number): boolean {
  if (source === target) return false;
  const card = takeFrom(state, source);
  const pile = state.piles[target];
  if (!card || !card.faceUp || !pile) return false;
  if (!canStack(card, topOf(pile))) return false;

  removeFrom(state, source);
  pile.push(card);
  state.moves++;
  return true;
}

export function moveToFoundation(state: SolitaireState, source: number): boolean {
  const card = takeFrom(state, source);
  if (!card || !card.faceUp || !canFoundation(state, card)) return false;

  removeFrom(state, source);
  state.foundations[card.suit] = card.rank;
  state.moves++;
  checkWin(state);
  return true;
}

function checkWin(state: SolitaireState): void {
  const { ranksPerSuit } = BALANCE.fluff.solitaire;
  state.won = state.foundations.every((rank) => rank >= ranksPerSuit);
}

/** Anything at all the player could do right now. Used to tell them the hand is
 *  dead rather than letting them stare at it. */
export function hasAnyMove(state: SolitaireState): boolean {
  if (state.stock.length > 0 || state.waste.length > 0) return true;
  for (let source = -1; source < state.piles.length; source++) {
    const card = takeFrom(state, source);
    if (!card || !card.faceUp) continue;
    if (canFoundation(state, card)) return true;
    for (let target = 0; target < state.piles.length; target++) {
      if (source !== target && canStack(card, topOf(state.piles[target] ?? []))) return true;
    }
  }
  return false;
}
