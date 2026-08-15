/**
 * ALL game-balance numbers live here.
 *
 * Rule: logic files import from this module and never hard-code a tunable.
 * Two designers should be able to rebalance the entire game from this one file
 * without reading a single line of game logic.
 */

export const BALANCE = {
  /** Screen + world geometry. */
  view: {
    /** Design resolution. The canvas scales up to fit the window, aspect preserved. */
    width: 960,
    height: 640,
    tileSize: 32,
    /** Camera easing toward the player. 1 = snap, 0.08 = soft office malaise. */
    cameraLerp: 0.12,
  },

  /** Player movement, in pixels per second. */
  player: {
    walkSpeed: 118,
    /** Held Shift. Not running — nobody runs here. This is "walking with purpose". */
    purposefulSpeed: 172,
    /** Physics body is a feet-box, narrower than the sprite, so corners feel forgiving. */
    bodyWidth: 16,
    bodyHeight: 12,
    /** Frames per second of the 3-frame walk cycle. */
    walkFrameRate: 7,
  },

  /** The workday clock. M2 wires this to the day loop; M1 only displays it. */
  clock: {
    startHour: 9,
    endHour: 17,
    /** Real-world seconds for one full 9-to-5. */
    realSecondsPerDay: 330,
    /** In-game minutes per tick of the clock display. */
    minuteStep: 5,
  },

  /**
   * Meter weights for the Friday Performance Review (M7).
   * Kept here from day one so tuning conversations have somewhere to happen.
   */
  review: {
    weights: {
      productivity: 0.5,
      bossApproval: 0.35,
      coworkerRep: 0.15,
    },
    /** Stress above this applies a penalty multiplier to the final score. */
    stressPenaltyThreshold: 70,
    stressPenaltyMultiplier: 0.85,
  },

  /** Meter ranges. Everything is 0-100 unless a designer says otherwise. */
  meters: {
    min: 0,
    max: 100,
    startProductivity: 0,
    startBossApproval: 50,
    startCoworkerRep: 50,
    startStress: 20,
  },

  /** Debug affordances. Enable with ?debug=1 in the URL; never on by default. */
  debug: {
    showFps: true,
    showTileCoords: true,
    showBodies: false,
  },
} as const;

export type Balance = typeof BALANCE;
