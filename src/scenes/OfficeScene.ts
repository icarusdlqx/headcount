import Phaser from 'phaser';
import { BALANCE } from '../config/balance';
import { TILESET_KEY } from '../art/placeholder';
import { Player } from '../entities/Player';
import { Hud, HUD_TEXT, createFluorescentOverlay } from '../ui/Hud';
import { UI_FONT } from '../ui/Win95';
import { CONTENT } from '../ui/daySummaryView';
import { morningOpener } from './DayEndScene';
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  PLACES,
  buildTileGrid,
  findUnreachablePlaces,
  roomAt,
} from '../world/officeMap';
import { SOLID_TILES, TILE } from '../world/tiles';
import { getDirector, type DayDirector } from '../sim/DayDirector';
import { DAY_EVENTS, type DayEndInfo } from '../sim/events';
import { MINUTES_PER_DAY } from '../sim/DayClock';
import { FLAGS } from '../util/flags';
import interactions from '../content/interactions.json';

/** Tile index -> content key, so flavour text is authored against readable names. */
const TILE_NAME: Record<number, string> = Object.fromEntries(
  Object.entries(TILE).map(([name, index]) => [index, name]),
);

const FLAVOUR = interactions as Record<string, string[] | string>;

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
    this.physics.add.collider(this.player, this.groundLayer);

    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.startFollow(this.player, true, BALANCE.view.cameraLerp, BALANCE.view.cameraLerp);
    this.cameras.main.setRoundPixels(true);

    this.overlay = createFluorescentOverlay(this);
    this.hud = new Hud(this);

    this.input.keyboard?.on('keydown-E', this.lookAtFacingTile, this);
    this.input.keyboard?.on('keydown-SPACE', this.lookAtFacingTile, this);

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

    if (minute < MINUTES_PER_DAY) return;

    // Five o'clock. Push the final clock read first so the frozen HUD under the
    // dialog says exactly 5:00 PM.
    this.hud.setClock(MINUTES_PER_DAY, this.director.weekday);

    const info = this.director.endDay();
    if (!info) return;

    this.endOfDay(info);
  }

  private endOfDay(info: DayEndInfo): void {
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
      this.time.delayedCall(BALANCE.dayEnd.resumeInputLockMs, () => this.player.setFrozen(false));
    }
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
    const room = roomAt(here.x, here.y, HUD_TEXT.roomUnknown);
    if (room !== this.lastRoom) {
      this.lastRoom = room;
      this.hud.setRoom(room);
      this.director.noteRoom(room);
    }

    this.updateDebug(delta);
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
