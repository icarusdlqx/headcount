/**
 * Character sheet geometry and facings.
 *
 * Deliberately Phaser-free and DOM-free. This lived in placeholder.ts, whose
 * first line imports Phaser — which meant anything in src/sim that needed a
 * facing dragged the whole engine into a node test process and broke it. The
 * pure modules are only pure if their transitive imports are too.
 */

export const CHAR_FRAME_W = 24;
export const CHAR_FRAME_H = 32;

/** Frame layout of a generated character sheet: 4 directions x 3 frames. */
export const CHAR_DIRECTIONS = ['down', 'up', 'left', 'right'] as const;
export type CharDirection = (typeof CHAR_DIRECTIONS)[number];
