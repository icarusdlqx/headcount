import Phaser from 'phaser';
import { BALANCE } from '../config/balance';
import { TILESET_KEY } from '../art/placeholder';
import { Player } from '../entities/Player';
import { Hud, HUD_TEXT, createFluorescentOverlay } from '../ui/Hud';
import { UI_FONT } from '../ui/Win95';
import { CONTENT, assertContentIntegrity } from '../ui/daySummaryView';
import { fill } from '../ui/format';
import { morningOpener } from './DayEndScene';
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  PLACES,
  ROOMS,
  buildTileGrid,
  findUnreachablePlaces,
  roomAt,
} from '../world/officeMap';
import { SOLID_TILES, TILE } from '../world/tiles';
import { getDirector, type DayDirector } from '../sim/DayDirector';
import { Npc } from '../entities/Npc';
import { Router } from '../sim/npcPath';
import { ACTOR_IDS } from '../sim/npcRoster';
import { createPose, poseAt, type NpcPose } from '../sim/npcSchedule';
import { DialogueBox } from '../ui/DialogueBox';
import { NPC_TEXT, chatterFor, greetingFor, nameFor, storyFor, titleFor } from '../ui/npcTalk';
import { formatClock } from '../ui/format';
import { METER } from '../sim/meters';
import type { PlanLeg } from '../sim/npcSchedule';
import { isFavorNpc } from '../sim/npcRoster';
import { assertVisibilityCoverage, type PresenceSample } from '../sim/meters';
import { buildOpacityGrid, watchedBy, type Observer, type Watched } from '../sim/sight';
import { SolitaireBoard, type BoardKey } from '../ui/SolitaireBoard';
import { deal, type SolitaireState } from '../sim/solitaire';
import { catchIsSilent, createWatchState, stepWatch, stressDelta, type FluffVenue, type WatchState } from '../sim/fluff';

import { misdialReplyDeltas } from '../sim/faxTray';
import { FAX_TEXT, LCD_CODES, assertFaxContentIntegrity } from '../ui/faxPanelView';
import { PRINTER_TEXT, PRINTER_CODES, assertPrinterContentIntegrity } from '../ui/printerView';
import { DAY_EVENTS, type DayEndInfo } from '../sim/events';
import { MINUTES_PER_DAY } from '../sim/DayClock';
import { FLAGS } from '../util/flags';
import interactions from '../content/interactions.json';

/** Tile index -> content key, so flavour text is authored against readable names. */
const TILE_NAME: Record<number, string> = Object.fromEntries(
  Object.entries(TILE).map(([name, index]) => [index, name]),
);

const FLAVOUR = interactions as Record<string, string[] | string>;

/** A leg that ends on the aisle tile is one of Dale's walkthroughs — which is
 *  exactly what Marjorie is selling when she tells you his movements. */
function pathEndsAtAisle(leg: PlanLeg): boolean {
  const tiles = leg.path.length / 2;
  if (tiles === 0) return false;
  return leg.path[(tiles - 1) * 2] === PLACES.farmAisle.x && leg.path[(tiles - 1) * 2 + 1] === PLACES.farmAisle.y;
}

/** Facing -> tile offset, hoisted so the look-at probe allocates nothing. */
const FACING_STEP: Record<string, readonly [number, number]> = {
  down: [0, 1],
  up: [0, -1],
  left: [-1, 0],
  right: [1, 0],
};

/**
 * The office floor. Owns the world, the player, the HUD, and the single call
 * site that advances in-game time.
 *
 * It never calls scene.pause() or scene.resume() on itself by hand: it listens
 * for CLOCK_HELD/CLOCK_RELEASED and derives that from the pause stack's modality.
 * Every caller anywhere says director.hold(reason) and nothing else.
 */
export class OfficeScene extends Phaser.Scene {
  private player!: Player;
  private hud!: Hud;
  private groundLayer!: Phaser.Tilemaps.TilemapLayer;
  private director!: DayDirector;
  private overlay!: Phaser.GameObjects.Rectangle;
  private debugText?: Phaser.GameObjects.Text;
  private debugAccumMs = 0;

  /** Scratch vector — reused so update() allocates nothing. */
  private readonly tileScratch = new Phaser.Math.Vector2();
  private lastRoom = '';
  private readonly cast: Npc[] = [];
  /** One reused pose object for the whole cast: five people, zero allocations. */
  private readonly poseScratch: NpcPose = createPose();

  private dialogue!: DialogueBox;
  /** The open conversation, if any. Stage drives what E does next. */
  private talk: {
    id: string;
    stage:
      | 'greeting' | 'menu' | 'chatter' | 'offer' | 'middle' | 'end' | 'granted'
      | 'steveAsk' | 'steveReply' | 'daleAsk' | 'daleReply';
  } | null = null;
  /** One story per person per day; reset each morning. */
  private storiesHeard = new Set<string>();
  /** Distinct chatter within a day: nth chat with someone draws a fresh line. */
  private chatCounts = new Map<string, number>();
  private lastTrayCount = -1;
  /** What each numbered option in the open menu does. */
  private menuActions: ('listen' | 'spend' | 'lookout' | 'leave')[] = [];

  /** Reused every minute so the meter step allocates nothing. Posture is derived
   *  fresh each time from the pause stack rather than latched by the fax scene:
   *  a latched 'busy' never clears, and busy has zero drift, which silently
   *  freezes Boss Approval and Stress forever after the player's first fax. */
  private readonly presence: PresenceSample = {
    room: '',
    posture: 'desk',
    moving: false,
    purposeful: false,
    atOwnDesk: true,
    speakerToday: false,
    tileX: 0,
    tileY: 0,
    eyes: 0,
    screenSeen: 0,
  };

  /** Sight opacity, built once from the same grid the tilemap uses. */
  private opacity!: Uint8Array;
  /** One reused observer slot per actor: five people, zero allocations a minute. */
  private readonly observerPool: Observer[] = [];
  private watched: Watched = { eyes: 0, screen: 0, watcherId: null };

  private board!: SolitaireBoard;
  /** The hand SURVIVES closing the board. Close, watch Dale pass, reopen to the
   *  same cards — that persistence is the best thing in the milestone. */
  private hand: SolitaireState | null = null;
  private readonly watch: WatchState = createWatchState();
  private lookoutReady = false;

  constructor() {
    super('Office');
  }

  create(): void {
    const size = BALANCE.view.tileSize;
    this.director = getDirector(this);

    const grid = buildTileGrid();
    if (import.meta.env.DEV) {
      const stranded = findUnreachablePlaces(grid);
      if (stranded.length > 0) {
        console.warn('[officeMap] unreachable from spawn:', stranded.join('; '));
      }
      // Authoring mistakes get found at author time, not as a silently wrong
      // number three weeks later.
      for (const problem of assertContentIntegrity()) console.warn(`[content] ${problem}`);
      for (const problem of assertFaxContentIntegrity(LCD_CODES)) console.warn(`[content] ${problem}`);
      for (const problem of assertPrinterContentIntegrity(PRINTER_CODES)) console.warn(`[content] ${problem}`);
      for (const problem of assertVisibilityCoverage(ROOMS)) console.warn(`[balance] ${problem}`);
    }

    const map = this.make.tilemap({ data: grid as number[][], tileWidth: size, tileHeight: size });
    const tileset = map.addTilesetImage(TILESET_KEY, TILESET_KEY, size, size, 0, 0);
    if (!tileset) throw new Error('OfficeScene: tileset failed to register');

    const layer = map.createLayer(0, tileset, 0, 0);
    if (!layer) throw new Error('OfficeScene: tile layer failed to create');
    this.groundLayer = layer;
    this.groundLayer.setCollision(SOLID_TILES as number[]);

    const worldW = MAP_WIDTH * size;
    const worldH = MAP_HEIGHT * size;
    this.physics.world.setBounds(0, 0, worldW, worldH);

    const spawn = PLACES.playerCubicle;
    this.player = new Player(this, spawn.x * size + size / 2, spawn.y * size + size / 2);
    // Face the desk, exactly as every morning after this one does. The
    // constructor's default is 'down', which on day one of a session left the
    // player staring into the aisle and made the desk uninteractable.
    this.player.placeAt(spawn.x, spawn.y, 'up');
    this.physics.add.collider(this.player, this.groundLayer);

    // Depth by row so people in front of you draw over you and people behind
    // draw under. The player's updates per frame in update() — a fixed depth
    // here drew NPCs over the player whenever the player stood lower on screen,
    // which read exactly like walking through them.
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.startFollow(this.player, true, BALANCE.view.cameraLerp, BALANCE.view.cameraLerp);
    this.cameras.main.setRoundPixels(true);

    // Routes are derived from the real grid at boot and memoised per goal, so a
    // map edit re-routes the whole cast instead of walking them through a wall.
    this.director.installRouter(new Router(grid));
    this.opacity = buildOpacityGrid(grid);
    for (const id of ACTOR_IDS) {
      const npc = new Npc(this, id, `npc-${id}`);
      // Solid. Immovable, so a colleague crossing your path stops you rather
      // than shoving you through a partition.
      this.physics.add.collider(this.player, npc);
      this.cast.push(npc);
    }

    this.overlay = createFluorescentOverlay(this);
    this.hud = new Hud(this);

    this.dialogue = new DialogueBox(this);
    this.board = new SolitaireBoard(this);

    this.input.keyboard?.on('keydown-E', this.interact, this);
    this.input.keyboard?.on('keydown-SPACE', this.interact, this);
    this.input.keyboard?.on('keydown-ENTER', this.interact, this);
    this.input.keyboard?.on('keydown-ESC', this.leaveTalk, this);
    (['ONE', 'TWO', 'THREE', 'FOUR'] as const).forEach((name, index) => {
      this.input.keyboard?.on(`keydown-${name}`, () => {
        if (this.board.isOpen) {
          this.board.pressPile(index);
          return;
        }
        this.chooseOption(index);
      });
    });
    this.input.keyboard?.on('keydown-LEFT', () => this.routeToBoard('left'));
    this.input.keyboard?.on('keydown-RIGHT', () => this.routeToBoard('right'));
    this.input.keyboard?.on('keydown-UP', () => this.routeToBoard('up'));

    this.wireDirector();
    this.wireWindowFocus();
    this.setupDebug();

    // Cold boot, and every reload mid-week: DayEndScene is what starts every
    // OTHER day, and it never runs on the first frame of a session.
    this.director.beginDay(Date.now());
    this.director.release('boot');

    // After beginDay, so a persistence problem outranks the morning opener in
    // the one slot the status bar has.
    this.showBootNotices();
    this.hud.setMeters(this.director.meters);
  }

  private wireDirector(): void {
    const events = this.director.events;

    events.on(DAY_EVENTS.MINUTE, this.onMinute, this);
    events.on(DAY_EVENTS.DAY_ADVANCED, this.resetForNewDay, this);
    events.on(DAY_EVENTS.CLOCK_HELD, this.onClockHeld, this);
    events.on(DAY_EVENTS.CLOCK_RELEASED, this.onClockReleased, this);
    events.on(DAY_EVENTS.DAY_START, this.onDayStart, this);

    // The director outlives this scene, so its listeners must be unbound or an
    // HMR reload doubles every one of them.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      events.off(DAY_EVENTS.MINUTE, this.onMinute, this);
      events.off(DAY_EVENTS.DAY_ADVANCED, this.resetForNewDay, this);
      events.off(DAY_EVENTS.CLOCK_HELD, this.onClockHeld, this);
      events.off(DAY_EVENTS.CLOCK_RELEASED, this.onClockReleased, this);
      events.off(DAY_EVENTS.DAY_START, this.onDayStart, this);
    });
  }

  /**
   * Phaser already stops its loop when the tab is hidden, but BLUR does not stop
   * it — so on a second monitor the workday burns while input is dead. A silent
   * hold, with no dialog: what the player did while away is an M5 concern.
   */
  private wireWindowFocus(): void {
    if (!BALANCE.clock.pauseOnWindowBlur || FLAGS.debug) return;

    const onBlur = (): void => this.director.hold('awayFromDesk');
    const onFocus = (): void => this.director.release('awayFromDesk');

    this.game.events.on(Phaser.Core.Events.BLUR, onBlur);
    this.game.events.on(Phaser.Core.Events.FOCUS, onFocus);
    this.game.events.on(Phaser.Core.Events.PAUSE, onBlur);
    this.game.events.on(Phaser.Core.Events.RESUME, onFocus);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(Phaser.Core.Events.BLUR, onBlur);
      this.game.events.off(Phaser.Core.Events.FOCUS, onFocus);
      this.game.events.off(Phaser.Core.Events.PAUSE, onBlur);
      this.game.events.off(Phaser.Core.Events.RESUME, onFocus);
    });
  }

  /**
   * Persistence notices arrive as content keys rather than prose, so M9's title
   * screen can present the same ones in its own chrome. There is one message
   * slot, so the first (most severe) wins and the rest go to the dev console.
   */
  private showBootNotices(): void {
    const notices = this.director.takeNotices();
    if (notices.length === 0) return;

    const first = NOTICE_TEXT[notices[0]!];
    if (first) this.hud.say(first, BALANCE.ui.noticeHoldMs);

    if (import.meta.env.DEV && notices.length > 1) {
      console.info('[save] additional notices:', notices.slice(1).join(', '));
    }
  }

  private onMinute(minute: number): void {
    this.hud.setClock(this.director.clock.displayMinute, this.director.weekday);

    // Passive drift hangs off the discrete minute, never off update(): a
    // per-frame drift makes 144Hz and 60Hz machines play different days.
    const sample = this.samplePresence();
    this.updateWatched();
    sample.eyes = this.watched.eyes;
    sample.screenSeen = this.watched.screen;
    this.director.stepMeters(sample);
    this.stepFluff();
    this.hud.setMeters(this.director.meters);

    // The bill for a misdial, arriving back at your desk long after you felt
    // good about it. Suppressed under a modal: hud.say uses a scene timer, and a
    // paused scene's timers do not advance, so the line would sit frozen behind
    // the panel and then eat the next message's window.
    if (this.director.takeMisdialReply(minute) && !this.director.pause.modal) {
      this.director.applyDeltas(misdialReplyDeltas());
      const dept = this.director.rng(`day:${this.director.state.dayIndex}:dept`).pick(FAX_TEXT.departments);
      this.hud.say(
        fill(this.director.rng(`day:${this.director.state.dayIndex}:reply`).pick(FAX_TEXT.outcome['misdialReply'] ?? ['']), { dept }),
        BALANCE.ui.noticeHoldMs,
      );
    }

    if (minute < MINUTES_PER_DAY) return;

    // Five o'clock. Push the final clock read first so the frozen HUD under the
    // dialog says exactly 5:00 PM.
    this.hud.setClock(MINUTES_PER_DAY, this.director.weekday);

    const info = this.director.endDay();
    if (!info) return;

    this.endOfDay(info);
  }

  private endOfDay(info: DayEndInfo): void {
    // Five o'clock does not care that you were mid-anecdote or mid-hand.
    if (this.talk) this.closeTalk();
    if (this.board.isOpen) this.closeBoard();
    // Otherwise a stale flavour line sits frozen under the modal, and its timer
    // hides the next morning's opener early.
    this.hud.clear();
    // Its tween chain freezes at whatever alpha it reached, so the office would
    // be a random brightness every night.
    this.tweens.killTweensOf(this.overlay);
    this.overlay.setAlpha(this.overlay.getData('baseAlpha') as number);

    this.scene.launch('DayEnd', info);
    this.director.hold('summary');
  }

  private onClockHeld(): void {
    this.player.setFrozen(true);
    if (this.director.pause.modal && !this.scene.isPaused()) this.scene.pause();
  }

  private onClockReleased(): void {
    if (this.scene.isPaused()) this.scene.resume();
    if (this.director.pause.running) {
      this.time.delayedCall(BALANCE.dayEnd.resumeInputLockMs, () => {
        if (!this.board.isOpen) this.player.setFrozen(false);
      });
      // The natural post-modal resync point: without it the fax's Productivity
      // gain is invisible until the next minute ticks, which is the whole payoff.
      this.hud.setMeters(this.director.meters);
      this.narrateFaxOutcome();
      this.narratePrinterOutcome();
    }
  }

  /** The reward lands OUTSIDE the modal, which is what makes the walk back to
   *  your cubicle feel earned. */
  private narratePrinterOutcome(): void {
    const outcome = this.director.takePrinterOutcome();
    if (!outcome) return;

    const rng = this.director.rng(`day:${this.director.state.dayIndex}:printerLine:${outcome.minutes}`);
    const key =
      outcome.kind === 'cleared'
        ? outcome.witnessed
          ? 'clearedWitnessed'
          : 'clearedUnwitnessed'
        : outcome.kind === 'shredded'
          ? 'shredded'
          : outcome.tears > 0
            ? 'torn'
            : 'abandoned';
    const pool = PRINTER_TEXT.outcome[key] ?? [];
    if (pool.length === 0) return;

    const name = outcome.witnessed ? nameFor(this.director.printerWitnessId ?? '') : '';
    this.hud.say(fill(rng.pick(pool), { name }));
  }

  private narrateFaxOutcome(): void {
    const outcome = this.director.takeFaxOutcome();
    if (!outcome) return;

    const rng = this.director.rng(`day:${this.director.state.dayIndex}:faxline:${outcome.jobId}`);
    let pool = FAX_TEXT.outcome[outcome.kind] ?? [];
    if (outcome.kind === 'sent' && outcome.owner === 'boss') pool = FAX_TEXT.outcome['sentBoss'] ?? pool;
    if (outcome.kind === 'abandoned' && outcome.jamLeftOpen) pool = FAX_TEXT.outcome['jamLeft'] ?? pool;
    if (pool.length === 0) return;
    this.hud.say(rng.pick(pool));
  }

  // --- conversations -------------------------------------------------------

  /** A numbered option was pressed. Ignored unless options are actually live. */
  private chooseOption(index: number): void {
    if (!this.talk || index >= this.dialogue.choices) return;
    const { id, stage } = this.talk;

    if (stage === 'menu') {
      this.resolveMenu(id, index);
      return;
    }
    if (stage === 'steveAsk') {
      this.resolveSteveAsk(index);
      return;
    }
    if (stage === 'daleAsk') {
      this.resolveDaleAsk(index);
      return;
    }
  }

  /** The opening menu: hear them out, spend what they owe you, or get on. */
  private showMenu(id: string): void {
    const favor = this.director.favorWith(id);
    const canStory = isFavorNpc(id) && !this.storiesHeard.has(id) && storyFor(id) !== null;
    const canSpend = isFavorNpc(id) && favor > 0;

    const options: string[] = [];
    this.menuActions = [];
    if (canStory) {
      options.push(NPC_TEXT.ui['optionListen'] ?? '');
      this.menuActions.push('listen');
    }
    if (canSpend) {
      options.push(`${NPC_TEXT.favors.spend[id] ?? ''}  (${favor})`);
      this.menuActions.push('spend');
    }
    // The lookout: Steve watches your back for one cough. Only he offers it —
    // it is exactly the favour a man who is never at his desk can provide.
    if (id === BALANCE.fluff.lookoutId && favor > 0 && !this.lookoutReady) {
      options.push(NPC_TEXT.sinks['steve_lookout']?.label ?? '');
      this.menuActions.push('lookout');
    }
    options.push(NPC_TEXT.ui['optionLeave'] ?? '');
    this.menuActions.push('leave');

    this.talk = { id, stage: 'menu' };
    this.dialogue.showChoices(
      chatterFor(id, this.director.rng(`day:${this.director.state.dayIndex}:chat:${id}:${this.chatCounts.get(id) ?? 0}`)),
      options,
      NPC_TEXT.ui['pick'] ?? '',
    );
  }

  private resolveMenu(id: string, index: number): void {
    const action = this.menuActions[index];
    if (action === 'listen') {
      const story = storyFor(id);
      if (!story) return void this.closeTalk();
      this.talk = { id, stage: 'offer' };
      this.dialogue.say(story.open, fill(NPC_TEXT.ui['offer'] ?? '', { min: BALANCE.dialogue.storyMinutes }));
      return;
    }
    if (action === 'spend') {
      this.spendFavor(id);
      return;
    }
    if (action === 'lookout') {
      this.director.spendFavor(id);
      this.director.spendMinutes(BALANCE.dialogue.sinks.minutes);
      this.lookoutReady = true;
      this.talk = { id, stage: 'end' };
      this.dialogue.say(NPC_TEXT.fluff.lookoutBought, NPC_TEXT.ui['close'] ?? '');
      return;
    }
    this.closeTalk();
  }

  /**
   * Cashing in. Every sink is built from what the game already contains, and
   * each one costs a few minutes: asking is never free, even among friends.
   */
  private spendFavor(id: string): void {
    this.director.spendFavor(id);
    this.director.spendMinutes(BALANCE.dialogue.sinks.minutes);
    let line = NPC_TEXT.sinks[id]?.line ?? '';

    if (id === 'dennis') {
      const token = this.director.nextUnlearnedFaxToken();
      if (token) this.director.markLearned([token]);
      else line = NPC_TEXT.sinks[id]?.exhausted ?? line;
    } else if (id === 'steve') {
      if (!this.director.dropNextJob()) line = NPC_TEXT.sinks[id]?.exhausted ?? line;
    } else if (id === 'pat') {
      if (!this.director.creditJobWithoutSending()) line = NPC_TEXT.sinks[id]?.exhausted ?? line;
    } else if (id === 'marjorie') {
      line = fill(line, { times: this.upcomingDaleWalks() });
    }

    this.hud.setMeters(this.director.meters);
    this.talk = { id, stage: 'end' };
    this.dialogue.say(line, NPC_TEXT.ui['close'] ?? '');
  }

  /** Marjorie's tip-off: when Dale is next in the aisle, read off the schedule. */
  private upcomingDaleWalks(): string {
    const legs = this.director.plan['dale'] ?? [];
    const now = this.director.minute;
    const times = legs
      .filter((leg) => leg.startMinute > now && pathEndsAtAisle(leg))
      .slice(0, 2)
      .map((leg) => formatClock(leg.startMinute, HUD_TEXT.timeFormat, HUD_TEXT.meridiem));
    return times.length > 0 ? times.join(' and ') : (NPC_TEXT.ui['noMoreWalks'] ?? '');
  }

  // --- Steve's quick lunch --------------------------------------------------

  /** True while he is standing at your desk about to ask. */
  private steveIsAsking(): boolean {
    const min = this.director.minute;
    const s = BALANCE.dialogue.steve;
    return (
      this.director.steveScenario === 'none' &&
      !this.director.steveBurned &&
      min >= s.askFromMinute &&
      min < s.leavesAtMinute
    );
  }

  /** True while Dale might reasonably ask where Steve has got to. */
  private daleWouldAsk(): boolean {
    const min = this.director.minute;
    const s = BALANCE.dialogue.steve;
    const stage = this.director.steveScenario;
    return (
      min >= s.leavesAtMinute &&
      min < s.returnsAtMinute &&
      (stage === 'covered' || stage === 'partial' || stage === 'declined')
    );
  }

  private openSteveAsk(): void {
    const c = NPC_TEXT.steveScenario;
    this.talk = { id: 'steve', stage: 'steveAsk' };
    this.director.setSteveStage('asked');
    this.dialogue.show('Steve', titleFor('steve'), c.ask.open, '');
    this.dialogue.showChoices(`${c.ask.detail} ${c.ask.stack}`, [
      c.choices.cover,
      c.choices.coverPartial,
      c.choices.decline,
      c.choices.needle,
    ], NPC_TEXT.ui['pick'] ?? '');
  }

  private resolveSteveAsk(index: number): void {
    const c = NPC_TEXT.steveScenario;
    const s = BALANCE.dialogue.steve;

    // The free question. He answers honestly and the offer stands.
    if (index === 3) {
      this.dialogue.showChoices(c.replies.needle, [c.choices.cover, c.choices.coverPartial, c.choices.decline], NPC_TEXT.ui['pick'] ?? '');
      return;
    }

    if (index === 0) {
      this.director.setSteveStage('covered');
      this.director.applyDeltas([{ key: METER.coworkerRep, delta: s.coverRapport }]);
      // His filing goes to the FRONT of your tray: the cost is real work.
      this.director.addSteveJob();
      this.director.grantFavor('steve');
      this.lastTrayCount = -1;
      this.dialogue.say(c.replies.cover, NPC_TEXT.ui['close'] ?? '');
    } else if (index === 1) {
      this.director.setSteveStage('partial');
      this.director.applyDeltas([{ key: METER.coworkerRep, delta: s.partialRapport }]);
      this.dialogue.say(c.replies.coverPartial, NPC_TEXT.ui['close'] ?? '');
    } else {
      this.director.setSteveStage('declined');
      this.director.applyDeltas([{ key: METER.coworkerRep, delta: s.declineRapport }]);
      this.dialogue.say(c.replies.decline, NPC_TEXT.ui['close'] ?? '');
    }

    this.hud.setMeters(this.director.meters);
    this.talk = { id: 'steve', stage: 'end' };
  }

  private openDaleAsk(): void {
    const c = NPC_TEXT.steveScenario.daleAsks;
    this.talk = { id: 'dale', stage: 'daleAsk' };
    this.dialogue.show('Dale', titleFor('dale'), c.open, '');
    this.dialogue.showChoices(c.open, [c.choices.cover, c.choices.shrug, c.choices.report], NPC_TEXT.ui['pick'] ?? '');
  }

  private resolveDaleAsk(index: number): void {
    const c = NPC_TEXT.steveScenario.daleAsks;
    const s = BALANCE.dialogue.steve;
    let line: string;

    if (index === 0) {
      // The lie. It survives if you actually did his filing — which is exactly
      // why the stack jumping your queue is the cost that matters.
      const checks = this.director.rng(`day:${this.director.state.dayIndex}:daleCheck`).next() < s.bossChecksChance;
      if (checks && !this.director.steveJobSent) {
        line = c.replies.coverChecked;
        this.director.applyDeltas([
          { key: METER.bossApproval, delta: s.caughtStanding },
          { key: METER.stress, delta: s.caughtStress },
        ]);
      } else {
        line = c.replies.coverBelieved;
      }
    } else if (index === 1) {
      line = c.replies.shrug;
      this.director.applyDeltas([{ key: METER.bossApproval, delta: s.shrugStanding }]);
    } else {
      line = c.replies.report;
      this.director.applyDeltas([{ key: METER.bossApproval, delta: s.reportStanding }]);
      // The durable half: Dale asks you first from now on, permanently.
      this.director.earnDaleTrust();
      this.director.burnSteve();
    }

    this.director.setSteveStage('resolved');
    this.hud.setMeters(this.director.meters);
    this.talk = { id: 'dale', stage: 'end' };
    this.dialogue.say(line, NPC_TEXT.ui['close'] ?? '');
  }

  // --- the card table ------------------------------------------------------

  /**
   * Opening holds NOTHING. The clock keeps running, the cast keeps walking, and
   * the boss can arrive behind you — which is the whole mechanic. The player is
   * frozen directly, which is independent of the pause stack.
   */
  private openBoard(): void {
    if (!this.hand) this.hand = deal(this.director.rng(`day:${this.director.state.dayIndex}:cards`));
    this.hud.clear();
    this.player.setFrozen(true);
    this.board.open(this.hand);
    this.board.setExposure(this.watched.screen);
  }

  /** The hand is kept. That persistence is the point. */
  private closeBoard(): void {
    this.board.hide();
    this.player.setFrozen(false);
    // Attention stops accruing the moment you stop.
    this.watch.dwell = 0;
    this.watch.venue = null;
  }

  /** What the player is currently doing that they would have to explain. */
  private currentVenue(): FluffVenue | null {
    if (this.board.isOpen) return 'solitaire';
    if (this.lastRoom === 'Bathroom') return 'bathroom';
    if (this.facingTileIs(TILE.COOLER)) return 'cooler';
    return null;
  }

  /** One minute of being watched while not working. */
  private stepFluff(): void {
    const venue = this.currentVenue();

    if (venue !== null) {
      this.director.applyDeltas([{ key: METER.stress, delta: stressDelta(venue) }]);
    }

    const result = stepWatch(this.watch, {
      venue,
      screen: this.watched.screen,
      eyes: this.watched.eyes,
      watcherId: this.watched.watcherId,
      lookout: this.lookoutReady,
    });

    if (this.board.isOpen) this.board.setExposure(this.watched.screen);

    if (result.kind === 'tipoff') {
      // Steve earns his favour. One cough, once.
      this.lookoutReady = false;
      this.hud.say(fill(NPC_TEXT.fluff.tipoff, { name: nameFor(BALANCE.fluff.lookoutId) }));
      return;
    }
    if (result.kind === 'warn') {
      // Only speak up on the first minute, or the message line becomes a siren.
      if (result.dwell === 1 && !this.board.isOpen) this.hud.say(NPC_TEXT.fluff.warn);
      return;
    }
    if (result.kind === 'caught') this.applyCatch(result.watcherId, result.offence);
  }

  /**
   * Caught. The hand is destroyed and the meter cost is deliberately small: the
   * sting is losing the game you were enjoying, which costs nothing and stings
   * exactly right. Piling numbers on top is the game raising its voice.
   */
  private applyCatch(watcherId: string, offence: number): void {
    const fluffText = NPC_TEXT.fluff;
    const rng = this.director.rng(`day:${this.director.state.dayIndex}:caught:${offence}`);

    this.board.hide();
    this.player.setFrozen(false);
    this.hand = null;

    const pool =
      watcherId === 'pat'
        ? fluffText.pat
        : catchIsSilent(offence, rng.next())
          ? fluffText.silent
          : offence > 1
            ? fluffText.repeat
            : fluffText.first;

    this.hud.say(rng.pick(pool), BALANCE.ui.noticeHoldMs);
    this.director.applyDeltas([
      { key: METER.bossApproval, delta: BALANCE.fluff.caughtStanding },
      { key: METER.stress, delta: BALANCE.fluff.caughtStress },
    ]);
    this.hud.setMeters(this.director.meters);
    this.director.spendMinutes(BALANCE.fluff.caughtMinutes);
    this.watch.resolving = false;
  }

  /**
   * Anybody in the printer room to see you fix it. Clearing the jam is worth
   * four times as much when it is witnessed — which makes knowing where people
   * are at what time (M4's schedules, Marjorie's favour) pay off in a second
   * currency.
   */
  private witnessInPrinterRoom(): string | null {
    for (const npc of this.cast) {
      if (!npc.visible) continue;
      const tx = Math.floor(npc.x / BALANCE.view.tileSize);
      const ty = Math.floor(npc.y / BALANCE.view.tileSize);
      if (roomAt(tx, ty, '') === 'Printer / fax room') return npc.actorId;
    }
    return null;
  }

  /** The nearest visible cast member within arm's reach, or null. */
  private nearestTalkableNpc(): Npc | null {
    const radius = BALANCE.npc.talkRadius * BALANCE.view.tileSize;
    const radiusSq = radius * radius;
    const px = (this.player.body as Phaser.Physics.Arcade.Body).center.x;
    const py = (this.player.body as Phaser.Physics.Arcade.Body).center.y;

    let best: Npc | null = null;
    let bestSq = radiusSq;
    for (const npc of this.cast) {
      if (!npc.visible) continue;
      // Feet to feet, not feet to sprite-centre: the player's body center sits
      // ~40px below their sprite's, and mixing the two frames made diagonal
      // adjacency land just outside the radius — E at a person did nothing.
      const nb = npc.body as Phaser.Physics.Arcade.Body;
      const dx = nb.center.x - px;
      const dy = nb.center.y - py;
      const distSq = dx * dx + dy * dy;
      if (distSq < bestSq) {
        best = npc;
        bestSq = distSq;
      }
    }
    return best;
  }

  private openTalk(id: string): void {
    // Non-modal: the clock stops but the scene keeps running and keeps input —
    // a conversation is a person in front of you, not a system dialog.
    this.director.hold('dialogue');
    this.hud.clear();
    this.talk = { id, stage: 'greeting' };

    // The scene takes precedence over small talk, on both sides of it.
    if (id === 'steve' && this.steveIsAsking()) return void this.openSteveAsk();
    if (id === 'dale' && this.daleWouldAsk()) return void this.openDaleAsk();

    const favor = this.director.favorWith(id);
    this.dialogue.show(
      nameFor(id),
      titleFor(id),
      greetingFor(id, favor, this.director.steveBurned && id === 'steve'),
      NPC_TEXT.ui['continue'] ?? '',
    );
  }

  private advanceTalk(): void {
    if (!this.talk) return;
    const { id, stage } = this.talk;
    const day = this.director.state.dayIndex;

    if (stage === 'greeting') {
      const nth = this.chatCounts.get(id) ?? 0;
      this.chatCounts.set(id, nth + 1);

      // Dale never owes anybody anything, so he just says his line and goes.
      if (!isFavorNpc(id)) {
        this.talk.stage = 'end';
        this.dialogue.say(chatterFor(id, this.director.rng(`day:${day}:chat:${id}:${nth}`)), NPC_TEXT.ui['close'] ?? '');
        return;
      }
      this.showMenu(id);
      return;
    }

    if (stage === 'offer') {
      // Staying IS the favour: the thing you gave them was your afternoon.
      const story = storyFor(id);
      if (!story) {
        this.closeTalk();
        return;
      }
      this.director.spendMinutes(BALANCE.dialogue.storyMinutes);
      this.storiesHeard.add(id);
      this.talk.stage = 'middle';
      this.dialogue.say(story.middle, NPC_TEXT.ui['continue'] ?? '');
      return;
    }

    if (stage === 'middle') {
      const story = storyFor(id);
      this.talk.stage = 'granted';
      this.dialogue.say(story?.end ?? '', NPC_TEXT.ui['continue'] ?? '');
      return;
    }

    if (stage === 'granted') {
      // The token lands as a MOMENT, in their words, not as a number ticking up.
      const granted = this.director.grantFavor(id);
      const line = granted ? (NPC_TEXT.favors.granted[id] ?? '') : (NPC_TEXT.favors.capped[id] ?? '');
      this.talk.stage = 'end';
      this.dialogue.say(line, NPC_TEXT.ui['close'] ?? '');
      return;
    }

    this.closeTalk();
  }

  /** Esc: walk away. Mid-offer it gets their "you're leaving" line as a parting
   *  message, which is the design — the option to leave is what makes staying
   *  a favour. */
  private leaveTalk(): void {
    // Esc closes the board first, and the hand is kept.
    if (this.board.isOpen) {
      this.closeBoard();
      return;
    }
    if (!this.talk) return;
    const story = storyFor(this.talk.id);
    if (this.talk.stage === 'offer' && story) {
      this.hud.say(story.leave);
    }
    this.closeTalk();
  }

  private closeTalk(): void {
    this.talk = null;
    this.dialogue.hide();
    this.director.release('dialogue');
  }

  /**
   * Who can see you this minute.
   *
   * Called from the MINUTE hook, never per frame: five raycasts over a 40x30
   * grid is cheap, but it is not free, and the project rule is that state hangs
   * off the discrete minute so two frame rates play the same day.
   */
  private updateWatched(): void {
    this.observerPool.length = 0;
    const plan = this.director.plan;
    const minute = this.director.minute;

    for (const npc of this.cast) {
      const pose = poseAt(plan, npc.actorId, minute, this.poseScratch);
      if (!pose.visible) continue;
      const watch = BALANCE.sight.observers[npc.actorId];
      if (!watch) continue;
      this.observerPool.push({
        id: npc.actorId,
        x: Math.round(pose.x),
        y: Math.round(pose.y),
        facing: pose.facing,
        attention: watch.attention,
        reports: watch.reports,
      });
    }

    const here = this.player.tileCoords(this.tileScratch);
    // Seated means at your own seat and still — the one place a partition can
    // actually hide you.
    const seated =
      !this.presence.moving && here.x === PLACES.playerCubicle.x && here.y === PLACES.playerCubicle.y;
    this.watched = watchedBy(this.opacity, this.observerPool, here.x, here.y, seated);
  }

  /** Rebuilt in place each minute. Posture is derived, never latched. */
  private samplePresence(): PresenceSample {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const here = this.player.tileCoords(this.tileScratch);
    const spawn = PLACES.playerCubicle;

    this.presence.room = this.lastRoom;
    this.presence.posture = this.director.pause.has('minigame')
      ? 'busy'
      : Math.abs(here.x - spawn.x) <= 1 && Math.abs(here.y - spawn.y) <= 1
        ? 'desk'
        : 'elsewhere';
    this.presence.moving = body.speed > 1;
    this.presence.purposeful = body.speed > BALANCE.player.walkSpeed + 1;
    this.presence.atOwnDesk = Math.abs(here.x - spawn.x) <= 1 && Math.abs(here.y - spawn.y) <= 1;
    this.presence.speakerToday = this.director.speakerChargedToday;
    this.presence.tileX = here.x;
    this.presence.tileY = here.y;
    this.presence.eyes = this.watched.eyes;
    this.presence.screenSeen = this.watched.screen;
    return this.presence;
  }

  private onDayStart(): void {
    const state = this.director.state;
    const opener = morningOpener(
      state.dayIndex,
      this.director.weekday,
      this.director.rng(`day:${state.dayIndex}:opener`),
    );
    this.hud.say(opener, BALANCE.ui.openerHoldMs);
    this.hud.setClock(0, this.director.weekday);
  }

  /**
   * The morning. Runs synchronously under full black, with no tweens of its own —
   * DayEndScene owns the fades because this scene is paused for part of them.
   */
  private resetForNewDay(): void {
    const spawn = PLACES.playerCubicle;
    // Facing up: (16,3) is the desk and (16,4) the carpet in front of it, so the
    // morning starts you at your monitor rather than staring into the aisle.
    this.player.placeAt(spawn.x, spawn.y, 'up');
    // Before the black lifts, or the camera visibly sails across the office
    // during the fade-up. The single most likely visual bug in the transition.
    this.cameras.main.centerOn(this.player.x, this.player.y);

    this.lastRoom = '';
    this.storiesHeard.clear();
    this.chatCounts.clear();
    this.hand = null;
    this.lookoutReady = false;
    this.watch.dwell = 0;
    this.watch.venue = null;
    this.watch.caughtToday = 0;
    if (this.board.isOpen) this.closeBoard();
    this.lastTrayCount = -1;
    this.hud.clear();
  }

  private setupDebug(): void {
    if (!FLAGS.debug) return;

    if (BALANCE.debug.showBodies) this.physics.world.createDebugGraphic();

    this.debugText = this.add
      .text(8, 8, '', { ...UI_FONT, color: '#7fff9f', backgroundColor: '#000000' })
      .setScrollFactor(0)
      .setDepth(1002)
      .setResolution(1);

    // Testing a 330-second day twenty times is otherwise an afternoon.
    this.input.keyboard?.on('keydown-L', () => this.director.endDayNow());
  }

  /**
   * E does the most specific thing available: use the fax machine if you are at
   * it, otherwise look at whatever you are facing.
   */
  /** One router, three tiers: board outranks conversation outranks world. */
  private routeToBoard(key: BoardKey): boolean {
    if (!this.board.isOpen) return false;
    this.board.press(key);
    return true;
  }

  private interact(): void {
    if (this.routeToBoard('confirm')) return;
    // An open conversation captures E before anything else — the 'dialogue'
    // pause reason holds the clock, so the pause.running check below would
    // otherwise eat the keypress that is supposed to advance the chat.
    if (this.talk) {
      this.advanceTalk();
      return;
    }

    if (!this.director.pause.running) return;

    // Your own seat, facing your own desk: the card table. Checked BEFORE the
    // NPC and fax branches, or somebody standing in your cubicle mouth makes the
    // board unopenable.
    const here = this.player.tileCoords(this.tileScratch);
    if (here.x === PLACES.playerCubicle.x && here.y === PLACES.playerCubicle.y && this.facingTileIs(TILE.DESK)) {
      this.openBoard();
      return;
    }

    const npc = this.nearestTalkableNpc();
    if (npc) {
      this.openTalk(npc.actorId);
      return;
    }

    // The printer. Placed BEFORE the fax branch but AFTER the NPC check, so a
    // colleague standing at the machine is still someone you can talk to rather
    // than scenery in front of a panel.
    if (this.facingTileIs(TILE.PRINTER)) {
      if (this.director.printerAvailable) {
        this.hud.clear();
        this.director.setPrinterWitness(this.witnessInPrinterRoom());
        this.scene.launch('Printer');
        this.director.hold('minigame');
        return;
      }
      this.hud.say(
        this.director.printerMachine.phase === 'shredded'
          ? (PRINTER_TEXT.outcome['alreadyShredded']?.[0] ?? '')
          : (PRINTER_TEXT.lcd['cleared'] ?? ''),
      );
      return;
    }

    if (this.facingTileIs(TILE.FAX)) {
      if (this.director.faxAvailable) {
        this.hud.clear();
        this.scene.launch('Fax');
        this.director.hold('minigame');
        return;
      }
      this.hud.say(this.director.nextJob === null ? HUD_TEXT.hints.faxDone : HUD_TEXT.hints.faxLate);
      return;
    }

    this.lookAtFacingTile();
  }

  private facingTileIs(index: number): boolean {
    const here = this.player.tileCoords(this.tileScratch);
    const step = FACING_STEP[this.player.facing];
    const tile = this.groundLayer.getTileAt(here.x + step![0], here.y + step![1]);
    return tile?.index === index;
  }

  /** Looks at whatever the player is facing, or the floor if that is nothing. */
  private lookAtFacingTile(): void {
    // Otherwise flavour fires behind a modal and consumes from the flavour stream
    // while the world is frozen.
    if (!this.director.pause.running) return;

    const here = this.player.tileCoords(this.tileScratch);
    const step = FACING_STEP[this.player.facing];

    const target = this.groundLayer.getTileAt(here.x + step![0], here.y + step![1]);
    const tile = target ?? this.groundLayer.getTileAt(here.x, here.y);
    if (!tile) return;

    const key = TILE_NAME[tile.index] ?? 'CARPET';
    const entry = FLAVOUR[key] ?? FLAVOUR['_fallback'];
    const lines = Array.isArray(entry) ? entry : entry ? [entry] : [];
    if (lines.length === 0) return;

    this.director.noteExamined();
    this.hud.say(this.director.rng('flavour').pick(lines));
  }

  override update(_time: number, delta: number): void {
    this.director.tick(delta);

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (this.director.pause.running) {
      // body.speed allocates nothing and is automatically zero when frozen.
      this.director.noteMovement(body.speed, delta);
    }

    const here = this.player.tileCoords(this.tileScratch);
    // Y-sorted rendering: the row you stand on is your draw order.
    if (this.player.depth !== here.y) this.player.setDepth(here.y);
    const room = roomAt(here.x, here.y, HUD_TEXT.roomUnknown);
    if (room !== this.lastRoom) {
      this.lastRoom = room;
      this.hud.setRoom(room);
      this.director.noteRoom(room);
    }

    this.syncCast();
    this.updateObjective();
    this.updateDebug(delta);
  }

  /** The hint pane carries the objective all day. Rebuilt only when the tray
   *  count changes, so the fill() allocation happens a handful of times a day. */
  private updateObjective(): void {
    const count = this.director.tray.length;
    if (count === this.lastTrayCount) return;
    this.lastTrayCount = count;
    this.hud.setHint(
      count === 0
        ? (HUD_TEXT.hints.objectiveDone ?? '')
        : fill(HUD_TEXT.hints.objective ?? '', { count }),
    );
  }

  /**
   * Everyone's position is recomputed from the clock each frame rather than
   * simulated, so the floor freezes correctly under a modal fax, resumes exactly
   * where the new minute says after one charges 100 minutes, and needs nothing
   * at the day boundary beyond the clock going back to zero.
   *
   * minutesFloat, not minute: the fraction is sub-tile interpolation, which is
   * presentation. Anything that makes a DECISION reads the discrete minute.
   */
  private syncCast(): void {
    const plan = this.director.plan;
    const minutes = this.director.minutesFloat;
    for (const npc of this.cast) {
      npc.syncTo(poseAt(plan, npc.actorId, minutes, this.poseScratch));
    }
  }

  /** Throttled: setText re-rasterises a canvas, so a per-frame readout is worse
   *  than the per-frame allocation the project rule bans. */
  private updateDebug(delta: number): void {
    if (!this.debugText) return;
    this.debugAccumMs += delta;
    if (this.debugAccumMs < BALANCE.debug.readoutIntervalMs) return;
    this.debugAccumMs = 0;

    const here = this.tileScratch;
    const fps = BALANCE.debug.showFps ? `${Math.round(this.game.loop.actualFps)}fps` : '';
    const coords = BALANCE.debug.showTileCoords ? `tile ${here.x},${here.y}` : '';
    const pause = BALANCE.debug.showPauseReasons ? this.director.pause.describe() : '';
    const state = this.director.state;
    this.debugText.setText(
      `${fps}  ${coords}  min ${this.director.minute}  day ${state.dayIndex} (wd ${this.director.weekday})  ${pause}  seed ${state.runSeed}`,
    );
  }
}

/** Kept next to the scene that shows them; CONTENT is the single prose source. */
export const NOTICE_TEXT = CONTENT.notices;
