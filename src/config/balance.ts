/**
 * ALL game-balance numbers live here.
 *
 * Rule: logic files import from this module and never hard-code a tunable.
 * Two designers should be able to rebalance the entire game from this one file
 * without reading a single line of game logic.
 *
 * Deliberately NOT here: the localStorage key and the save schema version (code
 * contracts — "retuning" them orphans every save), and layout geometry, which
 * lives beside its drawing code in HUD_LAYOUT and WIN95. A number that only
 * makes a window look right is not a rebalance.
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

  /** The workday clock. */
  clock: {
    startHour: 9,
    endHour: 17,
    /** Real seconds for one full 9-to-5. 480 game-minutes / 330s = 687.5ms each. */
    realSecondsPerDay: 330,
    /**
     * Display quantisation only — the simulation always advances one whole
     * in-game minute at a time. At 1 the clock is frantic and the compression
     * ratio becomes legible; at 15 it looks broken. 5 gives 96 lurches a day.
     */
    displayMinuteStep: 5,
    /**
     * Hard ceiling on one frame's contribution. Phaser's smoothDelta already
     * clamps around 200ms, but that is a config flag someone can switch off:
     * never depend on an engine default for a determinism guarantee.
     */
    maxTickDeltaMs: 250,
    /** Spiral-of-death guard on the catch-up loop. Backlog beyond this is dropped. */
    maxTicksPerFrame: 8,
    /** The hour the status bar reads LUNCH instead of the weekday. 0 disables. */
    lunchHour: 12,
    /**
     * Hold the clock when the window loses focus without the tab hiding. Phaser's
     * BLUR does not stop the loop, so without this the workday burns on a second
     * monitor while input is dead. Suppressed under ?debug=1, or opening devtools
     * would freeze the game every time.
     */
    pauseOnWindowBlur: true,
  },

  /** The working week. Nothing anywhere hard-codes "Friday". */
  week: {
    daysPerWeek: 5,
    /**
     * Which weekday ends the week. Selects the Friday remark and the weekend card
     * now; M7 hangs the Performance Review on the same number.
     */
    reviewDayIndex: 4,
  },

  /** The day boundary. Feel timings only — layout pixels live in HUD_LAYOUT/WIN95. */
  dayEnd: {
    /** How dark the office goes behind the modal. The frozen 5:00 PM clock must stay readable. */
    worldDimAlpha: 0.35,
    dimMs: 250,
    /**
     * 0.35 -> 1.0 at night, then 1.0 -> 0 next morning. Asymmetric on purpose: the
     * day ends faster than it starts. Full black is required rather than cosmetic —
     * the player is teleported up to 40 tiles under it.
     */
    blackoutMs: 250,
    wakeMs: 420,
    /**
     * The dialog refuses input this long after opening. Without it, a player still
     * holding a movement key skips their first summary without reading a word.
     */
    dialogInputLockMs: 450,
    weekendHoldMs: 2600,
    /** Floor before the weekend card accepts a key, so the Enter that dismissed
     *  Friday's summary does not eat it 200ms later. Same finger, half a second apart. */
    weekendSkipAfterMs: 600,
    /** The player stays frozen this long after the morning reset. */
    resumeInputLockMs: 250,
    /** A 32px tile is three feet of carpet. Made-up unit, made-up building. */
    feetPerTile: 3,
    /** Below this, the summary remarks on how little ground you covered. */
    lowDistanceFeet: 400,
    /** A single motionless stretch this long earns its own line. */
    longStationaryMs: 45000,
  },

  /** HUD timings. */
  ui: {
    messageHoldMs: 3200,
    /** The morning opener holds longer than a normal message. */
    openerHoldMs: 5000,
    /** Persistence notices hold longest — "not being recorded" deserves a read. */
    noticeHoldMs: 6000,
  },

  /** Persistence caps. Engineering invariants, not anti-cheat. */
  save: {
    /** Length gate applied BEFORE JSON.parse. A ten-year save is a few KB. */
    maxBlobChars: 65536,
    maxLearnedEntries: 128,
    maxMeterEntries: 32,
    maxFlagEntries: 256,
    /** Committed DayRecords retained. One week plus slack. */
    maxWeekRecords: 8,
    /** ~ten years of workdays. Keeps the week arithmetic sane if a save is hand-edited. */
    maxDayIndex: 2600,
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

  /** Debug affordances. Enabled with ?debug=1 in the URL; never on by default. */
  debug: {
    showFps: true,
    showTileCoords: true,
    showBodies: false,
    /** How often the ?debug=1 readout rebuilds its string, in ms. Never per-frame. */
    readoutIntervalMs: 250,
    /** Appends the held pause reasons, so a system that forgets to release names itself. */
    showPauseReasons: true,
  },
} as const;

export type Balance = typeof BALANCE;
