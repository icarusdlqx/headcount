import Phaser from 'phaser';
import { BALANCE } from '../config/balance';
import { TILESET_KEY } from '../art/placeholder';
import { Player } from '../entities/Player';
import { Hud, createFluorescentOverlay } from '../ui/Hud';
import { UI_FONT } from '../ui/Win95';
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  PLAYER_SPAWN_TILE,
  buildTileGrid,
  findUnreachablePlaces,
  roomAt,
} from '../world/officeMap';
import { SOLID_TILES, TILE } from '../world/tiles';
import { makeRng, resolveRunSeed, type Rng } from '../util/rng';
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
 * The office floor. M1 scope: a walkable map with collision, a room readout, and
 * looking at things. The day loop, meters and NPCs land on top of this scene.
 */
export class OfficeScene extends Phaser.Scene {
  private player!: Player;
  private hud!: Hud;
  private groundLayer!: Phaser.Tilemaps.TilemapLayer;
  private rng!: Rng;
  private debugText?: Phaser.GameObjects.Text;

  /** Scratch vectors — reused so update() allocates nothing. */
  private readonly tileScratch = new Phaser.Math.Vector2();
  private lastRoom = '';

  constructor() {
    super('Office');
  }

  create(): void {
    const size = BALANCE.view.tileSize;
    this.rng = makeRng(resolveRunSeed());

    const grid = buildTileGrid();
    if (import.meta.env.DEV) {
      const stranded = findUnreachablePlaces(grid);
      if (stranded.length > 0) {
        console.warn('[officeMap] unreachable from spawn:', stranded.join('; '));
      }
    }

    const map = this.make.tilemap({
      data: grid as number[][],
      tileWidth: size,
      tileHeight: size,
    });
    const tileset = map.addTilesetImage(TILESET_KEY, TILESET_KEY, size, size, 0, 0);
    if (!tileset) throw new Error('OfficeScene: tileset failed to register');

    const layer = map.createLayer(0, tileset, 0, 0);
    if (!layer) throw new Error('OfficeScene: tile layer failed to create');
    this.groundLayer = layer;
    this.groundLayer.setCollision(SOLID_TILES as number[]);

    const worldW = MAP_WIDTH * size;
    const worldH = MAP_HEIGHT * size;
    this.physics.world.setBounds(0, 0, worldW, worldH);

    this.player = new Player(this, PLAYER_SPAWN_TILE.x * size + size / 2, PLAYER_SPAWN_TILE.y * size + size / 2);
    this.physics.add.collider(this.player, this.groundLayer);

    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.startFollow(this.player, true, BALANCE.view.cameraLerp, BALANCE.view.cameraLerp);
    this.cameras.main.setRoundPixels(true);

    createFluorescentOverlay(this);
    this.hud = new Hud(this);
    this.hud.say('9:00 AM. Monday. Your monitor faces the aisle.', 5000);

    this.input.keyboard?.on('keydown-E', this.lookAtFacingTile, this);
    this.input.keyboard?.on('keydown-SPACE', this.lookAtFacingTile, this);

    this.setupDebug();
  }

  private setupDebug(): void {
    const params = new URLSearchParams(globalThis.location?.search ?? '');
    if (params.get('debug') !== '1') return;

    if (BALANCE.debug.showBodies) {
      this.physics.world.createDebugGraphic();
    }
    this.debugText = this.add
      .text(8, 8, '', { ...UI_FONT, color: '#7fff9f', backgroundColor: '#000000' })
      .setScrollFactor(0)
      .setDepth(1002)
      .setResolution(1);
  }

  /** Looks at whatever the player is facing, or the floor if that is nothing. */
  private lookAtFacingTile(): void {
    const here = this.player.tileCoords(this.tileScratch);
    const step = FACING_STEP[this.player.facing];

    const target = this.groundLayer.getTileAt(here.x + step[0], here.y + step[1]);
    const tile = target ?? this.groundLayer.getTileAt(here.x, here.y);
    if (!tile) return;

    const key = TILE_NAME[tile.index] ?? 'CARPET';
    const entry = FLAVOUR[key];
    const lines = Array.isArray(entry) ? entry : entry ? [entry] : ['It is exactly what it looks like.'];
    this.hud.say(this.rng.pick(lines));
  }

  override update(): void {
    const here = this.player.tileCoords(this.tileScratch);
    const room = roomAt(here.x, here.y);
    if (room !== this.lastRoom) {
      this.lastRoom = room;
      this.hud.setRoom(room);
    }

    if (this.debugText) {
      const fps = BALANCE.debug.showFps ? `${Math.round(this.game.loop.actualFps)} fps` : '';
      const coords = BALANCE.debug.showTileCoords ? `tile ${here.x},${here.y}` : '';
      this.debugText.setText(`${fps}  ${coords}  seed ${this.rng.seed}`);
    }
  }
}
