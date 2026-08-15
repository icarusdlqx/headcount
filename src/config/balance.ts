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

  /** The fax machine: the one work task M3 ships. */
  fax: {
    extensionDigits: 4,
    /** The entire joke, as a tunable. Compared against typed input, never
     *  printed, which is why it lives here and not in content. */
    outsideLinePrefix: '9',
    /** The morning tray. A mastered day fits about five, so on a six-job day
     *  something must go undone — which is where the choice lives. */
    trayMin: 4,
    trayMax: 6,
    ownerWeights: { yours: 4, boss: 3, colleague: 3 },
    /** The panel refuses to open after this, so a last-minute burn cannot eat an
     *  afternoon that was already spent. 440 = 4:20 PM. */
    lastCallMinute: 440,
    /** Refuses input this long after opening, or the E that opened the panel
     *  presses a key on it. Same reason dayEnd.dialogInputLockMs exists. */
    inputLockMs: 350,
    /** After this many jams in one session the LCD offers a hint. A machine that
     *  helps you after watching you fail three times is in character, and it caps
     *  the frustration exactly where it starts to sour. */
    hintAfterJams: 3,
    /**
     * Chance the machine is already jammed when you arrive in the morning, and
     * it is not your jam. Scaled by how much your colleagues like you: this is
     * Coworker Rep's ONLY mechanical consequence at M3, and it exists so that
     * taking a colleague's job is a real bet rather than a promissory note
     * against M4's favor economy. People stop clearing the machine for you.
     */
    foreignJamChanceAtZeroRep: 0.35,
    foreignJamChanceAtFullRep: 0.02,
    /**
     * Chance a job's recipient is engaged and the send fails, requiring REDIAL.
     * Seeded per job, so it is replayable but unknowable in advance. This is the
     * per-job uncertainty that keeps a MASTERED fax a decision rather than data
     * entry — without it, a player who knows the panel is executing nine fixed
     * keypresses by day eight, and the sixth key never earns its place.
     */
    busyChance: 0.22,

    /** The machine bills per ACTION, never per real second: deliberation is free,
     *  decisions are not. Charged through DayDirector.spendMinutes(). */
    minutes: {
      /**
       * There is deliberately no flat "setup" cost. The player physically walks
       * to the printer room, which already costs real in-game minutes (about 15
       * from the cubicle), so a folded-in trip charge would bill the same walk
       * twice. The press costs below are the whole price of using the machine.
       */
      press: 2,
      tray: 2,
      /** Load-bearing zero: only decisions cost time, so a master's five-digit
       *  run is five free presses. */
      digit: 0,
      start: 2,
      transmit: 6,
      /** ~3x, as fine mode genuinely was. Five fine jobs cost one whole other job. */
      transmitFine: 16,
      copy: 3,
      redial: 4,
      jam: 22,
      clearJam: 3,
      /** Someone forced it. Unavoidable if you want to fax at all today. */
      foreignJam: 18,
      abandon: 5,
    },

    productivityPerJob: 30,
    /** Somebody else's output is not your output, but you still occupied the
     *  machine. Zero would make colleague jobs pure altruism and nobody would
     *  ever take one. */
    productivityPerColleagueJob: 18,
    productivityDiminish: 0.8,
    productivityFineMultiplier: 1.15,
    productivityCreasedMultiplier: 0.85,

    bossApprovalPerBossJob: 6,
    /** Sized so a boss job is roughly neutral under review.weights
     *  (+6*0.35 - 9*0.15 = +0.75): it is really a bet on M4's favor economy. */
    coworkerRepPerBossJob: -9,
    bossApprovalPerColleagueJob: -4,
    coworkerRepPerColleagueJob: 10,
    coworkerRepPerMisdial: -7,
    coworkerRepPerJamLeftOpen: -8,
    coworkerRepPerForeignJamCleared: 5,
    /** Charged once per day on first use of the speaker key. The floor listens to
     *  you fail to send a fax for eight hours. */
    coworkerRepPerSpeakerDay: -5,

    stressPerJobStarted: 11,
    stressPerJobSent: -3,
    stressPerWrongPress: 1.5,
    stressPerJam: 6,
    stressPerAbandon: 4,
    /** The anti-spiral guard. Without it a fumbling player pins at 100 by lunch
     *  on Monday and the tier-3 transposition compounds into a death spiral,
     *  which breaks the "never punishing" rule. */
    stressCapPerJob: 16,
    /** Mistakes made while the panel is degraded cost half. Damps the spiral, and
     *  it is funnier: it was not really your fault. */
    wrongPressStressMultiplierWhenDegraded: 0.5,

    /** How long the department you actually reached takes to come looking for you.
     *  Counted in discrete in-game MINUTES, never a wall-clock timer. */
    misdialReplyMinutes: { min: 25, max: 70 },

    /** Presentation only — the minutes were charged already. Separated from
     *  `minutes` precisely so tuning a tween cannot couple in-game to real time. */
    animMs: { feed: 450, tray: 200, copy: 900, crumple: 700, transmit: 2600, ok: 900, eject: 500 },
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

  /**
   * Meter ranges. Everything is 0-100 unless a designer says otherwise.
   *
   * There is deliberately no startVisibility: the morning value is
   * visibilityTarget(DESK_AT_REST), so "what your own desk reads" has one source
   * of truth rather than a constant that can drift away from the room table.
   */
  meters: {
    min: 0,
    max: 100,
    startProductivity: 0,
    startBossApproval: 50,
    startCoworkerRep: 50,
    startStress: 20,

    /** Overnight ease toward the baselines above, as a fraction of the remaining
     *  distance. The boss's memory is short; coworkers remember. */
    overnightBossRegress: 0.2,
    overnightCoworkerRegress: 0.12,
    overnightStressRegress: 0.25,
    /** Friday night is three nights. Your heroics are half-forgotten by Monday. */
    weekendRegressMultiplier: 2.0,
    /** Ceiling on the product above. A rate over 1 overshoots the baseline and
     *  INVERTS the meter: a Friday of 85 would return as a Monday of 5. */
    maxOvernightRegressRate: 0.6,
  },

  /**
   * Per-minute passive drift by posture. Rates are "fraction of the remaining
   * distance to target, per in-game minute", so a designer reasons in day-lengths
   * rather than in absolute points.
   *
   * Only three postures at M3. The break room and the bathroom deliberately have
   * no stress-shedding rates yet: a priced hiding place IS the fluffing economy,
   * and M5 is what makes hiding risky. Shipping the reward before the risk would
   * be shipping a dominant strategy on purpose.
   */
  presence: {
    /** Boss and Stress drift are both multiplied by floor + (1-floor)*visibility.
     *  Because it scales the whole (target - value) * rate term, the sign is
     *  automatically right everywhere: being seen accelerates the gain at your
     *  desk and the bleed anywhere else, and it always costs stress. */
    bossVisibilityFloor: 0.5,
    desk: { bossTarget: 76, bossRate: 0.004, stressTarget: 26, stressRate: 0.0022 },
    /** Mid-fax. Management has no opinion while you are actually working — the
     *  cost of faxing is the desk minutes you did not accrue. */
    busy: { bossTarget: 50, bossRate: 0.0, stressTarget: 40, stressRate: 0.0 },
    elsewhere: { bossTarget: 44, bossRate: 0.002, stressTarget: 40, stressRate: 0.0008 },
  },

  /** How observed the player is right now. M5 replaces visibilityTarget()'s body
   *  with line-of-sight; every number here survives that unchanged. */
  visibility: {
    /** Ease per in-game minute. */
    ease: 0.12,
    /** Keyed by the exact ROOMS[].name strings in world/officeMap.ts, which are
     *  already declared there as data keys for M4 and M5. */
    roomExposure: {
      "Boss's office": 96,
      'The corridor': 84,
      'The cubicle farm': 58,
      'Conference room': 52,
      'Printer / fax room': 44,
      'Break room': 34,
      'Supply & mail': 26,
      'IT closet': 12,
      Bathroom: 6,
    },
    /** An unknown room must yield a number, never undefined -> NaN. One NaN
     *  entering meters propagates through every later drift step. */
    fallbackExposure: 84,
    /** Your body is behind a partition. */
    ownDeskDelta: -12,
    movingDelta: 10,
    /** Shift shipped in M1 specifically to give Visibility something to react to. */
    purposefulDelta: 8,
    /** A fax machine mid-handshake is the loudest object on the floor. */
    busyDelta: 6,
    /** Once the speaker key has been used today, the whole floor can hear you. */
    speakerDelta: 14,
  },

  /** Comedic degradation thresholds. Never a hard fail. */
  stress: {
    jitterAt: 45,
    /** Deliberately the same number as review.stressPenaltyThreshold, so the
     *  mechanical brake at M3 and the scored brake at M7 are one lesson. */
    blurAt: 70,
    transposeAt: 88,
    blurAlpha: 0.45,
    jitterPx: 1,
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
