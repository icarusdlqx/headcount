import type { CharDirection } from '../art/charFrames';

/**
 * The cast. Pure data — no Phaser, no DOM — so schedules and dialogue gates can
 * be unit-tested in node.
 *
 * Four favor NPCs (the COLLEAGUE_IDS the fax tray has been handing out since M3)
 * plus Dale, who has a schedule and a conversation but NO favor track. You
 * cannot do your boss a favour. You can only be seen.
 *
 * Casting principle: each of the four is a different ANSWER TO THE SAME
 * QUESTION — "how do you survive eight hours here?" Steve leaves, Marjorie
 * knows things, Dennis hides, Pat complies. The player is the fifth answer and
 * has not picked yet.
 */

export const NPC_IDS = ['steve', 'marjorie', 'dennis', 'pat'] as const;
export type NpcId = (typeof NPC_IDS)[number];

/** Dale is an actor, not a colleague. Kept separate so no favor code can reach him. */
export const BOSS_ID = 'dale';
export type ActorId = NpcId | typeof BOSS_ID;

export const ACTOR_IDS: readonly ActorId[] = [...NPC_IDS, BOSS_ID];

/**
 * Everything the art generator needs to draw one person, as plain numbers.
 * The silhouette must read at 24x32 from across a 30-tile camera, so each
 * character gets exactly one strong shape tell and one strong colour tell —
 * more than that and they all turn to mush at this size.
 */
export interface CharacterLook {
  readonly shirt: number;
  readonly shirtShade: number;
  readonly trousers: number;
  readonly hair: number;
  readonly skin: number;
  /** A tie, drawn front-facing only. 0 = no tie. */
  readonly tie: number;
  /** Extra body width in pixels, per side. The shape tell. */
  readonly build: number;
  /** Hair height in pixels. 0 reads as bald at this scale. */
  readonly hairHeight: number;
  /** Drawn as a bright band across the shirt: Steve's Friday Hawaiian. */
  readonly pattern: number;
}

export interface NpcDef {
  readonly id: ActorId;
  /** Content key into npcs.json. Never rendered prose. */
  readonly nameKey: string;
  readonly look: CharacterLook;
  /** Which way they face when parked at their desk. */
  readonly restFacing: CharDirection;
  /**
   * Schedule wobble in minutes, applied to every block but the first. Pat's is
   * ZERO and that is the entire point of Pat: she is the one schedule a player
   * can learn, and a +/-6 minute daily wobble is precisely "you cannot set your
   * watch by Pat", which is the only thing she is for.
   */
  readonly jitterMinutes: number;
}

/** Palette-adjacent literals live here rather than in balance.ts: these are
 *  identity, not tuning. A designer retuning numbers must not restyle the cast. */
export const ROSTER: Readonly<Record<ActorId, NpcDef>> = {
  // Sales. Loud, warm, genuinely good company, and absent. The scenario NPC.
  // He is likeable ON PURPOSE — covering for a man you dislike is not a dilemma.
  steve: {
    id: 'steve',
    nameKey: 'steve',
    look: {
      shirt: 0xd8785a,
      shirtShade: 0xb85f45,
      trousers: 0x4a4e58,
      hair: 0x2e2118,
      skin: 0xd8b08c,
      tie: 0x2f4f7a,
      build: 1,
      hairHeight: 4,
      pattern: 0x7fc4a8, // the Hawaiian band. Fridays only; the scene swaps it in.
    },
    restFacing: 'down',
    jitterMinutes: 6,
  },

  // The Old Guard. Twenty-two years, a mail cart, and the whole building's
  // gossip. She comes to YOU twice a day, which makes her the one NPC the
  // player never has to hunt for — an information broker who arrives.
  marjorie: {
    id: 'marjorie',
    nameKey: 'marjorie',
    look: {
      shirt: 0x8d6f9c,
      shirtShade: 0x745a80,
      trousers: 0x3f3a46,
      hair: 0xc9c4bb, // grey, and high — the strongest silhouette in the cast
      skin: 0xe0bb98,
      tie: 0,
      build: 2,
      hairHeight: 7,
      pattern: 0,
    },
    restFacing: 'left',
    jitterMinutes: 3,
  },

  // IT. Black t-shirt, server closet, speaks exclusively in prerequisites.
  // Emerges more than the design wanted him to, because an NPC you never meet
  // is indistinguishable from an NPC who was never implemented.
  dennis: {
    id: 'dennis',
    nameKey: 'dennis',
    look: {
      shirt: 0x24242a,
      shirtShade: 0x17171c,
      trousers: 0x35333a,
      hair: 0x3b2f26,
      skin: 0xcfae8e,
      tie: 0,
      build: 0,
      hairHeight: 6,
      pattern: 0,
    },
    restFacing: 'up',
    jitterMinutes: 4,
  },

  // Accounting. The metronome. Every block on a quarter hour, identical every
  // weekday, forever. ZERO jitter: Pat is the schedule you learn, and learning
  // her is the moment the office stops being random and starts being a system.
  pat: {
    id: 'pat',
    nameKey: 'pat',
    look: {
      shirt: 0xc9cdd4,
      shirtShade: 0xaeb3bc,
      trousers: 0x5a5148,
      hair: 0x6b4a30,
      skin: 0xd6ad8a,
      tie: 0x6b7f5a,
      build: 0,
      hairHeight: 5,
      pattern: 0,
    },
    restFacing: 'down',
    jitterMinutes: 0,
  },

  // Management. Power tie, thinning hair, and a belief in walking around.
  // No favor track: you cannot do Dale a favour, you can only be seen.
  dale: {
    id: BOSS_ID,
    nameKey: 'dale',
    look: {
      shirt: 0xe6e6e0,
      shirtShade: 0xc6c6c0,
      trousers: 0x2c3550,
      hair: 0x6e6257,
      skin: 0xd9b48f,
      tie: 0x8f1f2e, // the power tie, and the thing you learn to spot at range
      build: 2,
      hairHeight: 2, // thinning. Reads as a distinct head shape at 24px.
      pattern: 0,
    },
    restFacing: 'down',
    jitterMinutes: 5,
  },
};

export function isFavorNpc(id: string): id is NpcId {
  return (NPC_IDS as readonly string[]).includes(id);
}
