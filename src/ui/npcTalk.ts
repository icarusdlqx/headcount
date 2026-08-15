import npcContent from '../content/npcs.json';
import { BALANCE } from '../config/balance';
import type { Rng } from '../util/rng';

/**
 * Typed access to the cast's spoken words, plus the small pickers that decide
 * which of them get said. All prose lives in npcs.json; this file only chooses.
 */

interface Story {
  open: string;
  middle: string;
  end: string;
  leave: string;
}

interface NpcContent {
  names: Record<string, string>;
  titles: Record<string, string>;
  chatter: Record<string, string[]>;
  stories: Record<string, Story>;
  greetings: {
    cold: Record<string, string>;
    neutral: Record<string, string>;
    warm: Record<string, string>;
  };
  favors: {
    granted: Record<string, string>;
    spend: Record<string, string>;
    none: Record<string, string>;
    capped: Record<string, string>;
  };
  ui: Record<string, string>;
  sinks: Record<string, { label: string; line: string; exhausted: string }>;
  fluff: {
    silent: string[];
    first: string[];
    repeat: string[];
    pat: string[];
    warn: string;
    tipoff: string;
    gotAway: string;
    lookoutBought: string;
    lookoutSpent: string;
    venue: Record<string, string>;
    cards: {
      ranks: string[];
      suits: string[];
      title: string;
      hint: string;
      won: string;
      stuck: string;
    };
  };
  steveScenario: {
    ask: Record<string, string>;
    choices: Record<string, string>;
    replies: Record<string, string>;
    daleAsks: {
      open: string;
      choices: Record<string, string>;
      replies: Record<string, string>;
    };
    aftermath: Record<string, string>;
  };
}

// resolveJsonModule widens the maps, so the cast is required rather than lazy —
// the same pattern as FLAVOUR and FAX_TEXT.
export const NPC_TEXT = npcContent as unknown as NpcContent;

/**
 * The relationship is legible in how someone greets you, before any number is
 * shown. Warm takes two favors owed; cold is reserved for a burned bridge
 * (the steve.burned flag, once the scenario lands).
 */
export function greetingFor(id: string, favor: number, burned: boolean): string {
  const tier = burned ? 'cold' : favor >= BALANCE.dialogue.warmAt ? 'warm' : 'neutral';
  return NPC_TEXT.greetings[tier][id] ?? NPC_TEXT.greetings.neutral[id] ?? '';
}

/** Seeded per day, per person, per conversation — so a replayed day says the
 *  same things, and two chats in one day say different ones. */
export function chatterFor(id: string, rng: Rng): string {
  const pool = NPC_TEXT.chatter[id];
  if (!pool || pool.length === 0) return '';
  return rng.pick(pool);
}

export function storyFor(id: string): Story | null {
  return NPC_TEXT.stories[id] ?? null;
}

export function nameFor(id: string): string {
  return NPC_TEXT.names[id] ?? id;
}

export function titleFor(id: string): string {
  return NPC_TEXT.titles[id] ?? '';
}
