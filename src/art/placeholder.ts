import Phaser from 'phaser';
import { PALETTE, css } from './palette';
import { TILE, TILE_COUNT } from '../world/tiles';
import { makeRng } from '../util/rng';
import { CHAR_DIRECTIONS, CHAR_FRAME_H, CHAR_FRAME_W, type CharDirection } from './charFrames';

/**
 * Procedural placeholder art.
 *
 * M9 replaces all of this with a hand-drawn 32x32 tileset and character sheets.
 * Until then everything is drawn into canvas textures at boot: no binary assets,
 * no asset pipeline, and the palette stays in one place. Drawing is seeded, so
 * the speckle pattern is identical on every load.
 */

export const TILESET_KEY = 'tiles';
export const PLAYER_KEY = 'player';

export const TILE_SIZE = 32;

// Geometry and facings live in a Phaser-free module so src/sim can import them
// without pulling the engine into a node test process. Re-exported here so
// existing call sites are unaffected.
export { CHAR_DIRECTIONS, CHAR_FRAME_H, CHAR_FRAME_W, type CharDirection } from './charFrames';

type Ctx = CanvasRenderingContext2D;

function fill(ctx: Ctx, color: number, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = css(color);
  ctx.fillRect(x, y, w, h);
}

/** Builds the 32x32 tileset texture. Tiles are laid out in one row, index order. */
export function createTileset(scene: Phaser.Scene): void {
  if (scene.textures.exists(TILESET_KEY)) return;

  const texture = scene.textures.createCanvas(TILESET_KEY, TILE_SIZE * TILE_COUNT, TILE_SIZE);
  if (!texture) throw new Error('createTileset: could not create canvas texture');
  const ctx = texture.getContext();
  ctx.imageSmoothingEnabled = false;

  const rng = makeRng(0x0ff1ce);
  const at = (index: number) => index * TILE_SIZE;

  // --- carpet: institutional speckle -------------------------------------
  const carpet = at(TILE.CARPET);
  fill(ctx, PALETTE.carpet, carpet, 0, TILE_SIZE, TILE_SIZE);
  for (let i = 0; i < 90; i++) {
    const c = rng.chance(0.5) ? PALETTE.carpetSpeckA : PALETTE.carpetSpeckB;
    fill(ctx, c, carpet + rng.int(0, 31), rng.int(0, 31), 1, 1);
  }

  // --- wall: pale yellow with a scuffed baseboard -------------------------
  const wall = at(TILE.WALL);
  fill(ctx, PALETTE.wallFace, wall, 0, TILE_SIZE, TILE_SIZE);
  fill(ctx, PALETTE.wallShade, wall, 0, TILE_SIZE, 6);
  fill(ctx, PALETTE.wallEdge, wall, 5, TILE_SIZE, 1);
  fill(ctx, PALETTE.baseboard, wall, 26, TILE_SIZE, 6);
  fill(ctx, PALETTE.wallEdge, wall, 26, TILE_SIZE, 1);
  for (let i = 0; i < 10; i++) fill(ctx, PALETTE.wallShade, wall + rng.int(0, 31), rng.int(8, 24), 1, 1);

  // --- cubicle partition: gray-blue fabric with a vertical weave ----------
  const cube = at(TILE.CUBICLE);
  fill(ctx, PALETTE.cubicleFace, cube, 0, TILE_SIZE, TILE_SIZE);
  for (let x = 0; x < TILE_SIZE; x += 3) fill(ctx, PALETTE.cubicleWeave, cube + x, 0, 1, TILE_SIZE);
  fill(ctx, PALETTE.cubicleTop, cube, 0, TILE_SIZE, 4);
  fill(ctx, PALETTE.cubicleTrim, cube, 4, TILE_SIZE, 1);
  fill(ctx, PALETTE.cubicleTrim, cube, 29, TILE_SIZE, 3);

  // --- desk: brown veneer, edge banding peeling on the near side ----------
  const desk = at(TILE.DESK);
  fill(ctx, PALETTE.deskTop, desk, 0, TILE_SIZE, TILE_SIZE);
  fill(ctx, PALETTE.deskHighlight, desk, 0, TILE_SIZE, 3);
  fill(ctx, PALETTE.deskEdge, desk, 27, TILE_SIZE, 5);
  for (let i = 0; i < 14; i++) fill(ctx, PALETTE.deskEdge, desk + rng.int(0, 31), rng.int(4, 26), rng.int(2, 5), 1);

  // --- doorway: carpet with a frame on either side ------------------------
  const door = at(TILE.DOORWAY);
  fill(ctx, PALETTE.carpet, door, 0, TILE_SIZE, TILE_SIZE);
  for (let i = 0; i < 40; i++) fill(ctx, PALETTE.carpetSpeckA, door + rng.int(0, 31), rng.int(0, 31), 1, 1);
  fill(ctx, PALETTE.doorFrame, door, 0, 4, TILE_SIZE);
  fill(ctx, PALETTE.doorFrame, door + 28, 0, 4, TILE_SIZE);

  // --- vinyl: break room / bathroom tile, on the diagonal grid ------------
  const vinyl = at(TILE.VINYL);
  fill(ctx, PALETTE.vinylA, vinyl, 0, TILE_SIZE, TILE_SIZE);
  fill(ctx, PALETTE.vinylB, vinyl, 0, 16, 16);
  fill(ctx, PALETTE.vinylB, vinyl + 16, 16, 16, 16);
  fill(ctx, PALETTE.grout, vinyl, 15, TILE_SIZE, 1);
  fill(ctx, PALETTE.grout, vinyl + 15, 0, 1, TILE_SIZE);

  // --- printer: beige slab, paper tray, permanent amber light -------------
  const printer = at(TILE.PRINTER);
  fill(ctx, PALETTE.carpet, printer, 0, TILE_SIZE, TILE_SIZE);
  fill(ctx, PALETTE.applianceBody, printer + 2, 4, 28, 26);
  fill(ctx, PALETTE.applianceShade, printer + 2, 4, 28, 4);
  fill(ctx, PALETTE.applianceDark, printer + 5, 14, 22, 3);
  fill(ctx, PALETTE.paper, printer + 7, 17, 18, 6);
  fill(ctx, PALETTE.ledRed, printer + 25, 9, 2, 2);

  // --- fax: same beige, plus a handset ------------------------------------
  const fax = at(TILE.FAX);
  fill(ctx, PALETTE.carpet, fax, 0, TILE_SIZE, TILE_SIZE);
  fill(ctx, PALETTE.applianceBody, fax + 3, 6, 26, 22);
  fill(ctx, PALETTE.applianceShade, fax + 3, 6, 26, 3);
  fill(ctx, PALETTE.applianceDark, fax + 5, 11, 9, 13);
  fill(ctx, PALETTE.applianceShade, fax + 16, 12, 11, 8);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) fill(ctx, PALETTE.applianceDark, fax + 17 + c * 3, 13 + r * 2, 2, 1);
  fill(ctx, PALETTE.ledGreen, fax + 25, 8, 2, 2);

  // --- water cooler --------------------------------------------------------
  const cooler = at(TILE.COOLER);
  fill(ctx, PALETTE.carpet, cooler, 0, TILE_SIZE, TILE_SIZE);
  fill(ctx, PALETTE.coolerStand, cooler + 9, 16, 14, 14);
  fill(ctx, PALETTE.coolerJug, cooler + 10, 3, 12, 14);
  fill(ctx, PALETTE.coolerWater, cooler + 11, 6, 10, 10);
  fill(ctx, PALETTE.applianceDark, cooler + 14, 20, 4, 2);

  // --- server rack ---------------------------------------------------------
  const rack = at(TILE.RACK);
  fill(ctx, PALETTE.carpet, rack, 0, TILE_SIZE, TILE_SIZE);
  fill(ctx, PALETTE.rack, rack + 2, 2, 28, 28);
  for (let y = 5; y < 28; y += 5) {
    fill(ctx, PALETTE.applianceDark, rack + 4, y, 24, 3);
    fill(ctx, y % 10 === 0 ? PALETTE.ledGreen : PALETTE.ledRed, rack + 25, y + 1, 2, 1);
  }

  // --- conference / break room table --------------------------------------
  const table = at(TILE.TABLE);
  fill(ctx, PALETTE.carpet, table, 0, TILE_SIZE, TILE_SIZE);
  fill(ctx, PALETTE.deskTop, table, 0, TILE_SIZE, TILE_SIZE);
  fill(ctx, PALETTE.deskHighlight, table, 0, TILE_SIZE, 2);
  fill(ctx, PALETTE.deskEdge, table, 30, TILE_SIZE, 2);
  fill(ctx, PALETTE.deskHighlight, table + 6, 8, 20, 1);

  // --- plant, allegedly real ----------------------------------------------
  const plant = at(TILE.PLANT);
  fill(ctx, PALETTE.carpet, plant, 0, TILE_SIZE, TILE_SIZE);
  fill(ctx, PALETTE.potTerracotta, plant + 11, 21, 10, 9);
  for (let i = 0; i < 26; i++) {
    const c = rng.chance(0.5) ? PALETTE.leafDark : PALETTE.leafLight;
    fill(ctx, c, plant + rng.int(7, 24), rng.int(4, 21), rng.int(2, 4), rng.int(2, 4));
  }

  texture.refresh();
}

/**
 * Builds the player sheet: 4 directions x 3 frames (idle, step A, step B).
 * A dress shirt, a tie nobody asked for, and shoes that have given up.
 */
export function createCharacter(scene: Phaser.Scene): void {
  if (scene.textures.exists(PLAYER_KEY)) return;

  const cols = 3;
  const rows = CHAR_DIRECTIONS.length;
  const texture = scene.textures.createCanvas(PLAYER_KEY, CHAR_FRAME_W * cols, CHAR_FRAME_H * rows);
  if (!texture) throw new Error('createCharacter: could not create canvas texture');
  const ctx = texture.getContext();
  ctx.imageSmoothingEnabled = false;

  CHAR_DIRECTIONS.forEach((dir, row) => {
    for (let col = 0; col < cols; col++) {
      drawCharacterFrame(ctx, col * CHAR_FRAME_W, row * CHAR_FRAME_H, dir, col);
    }
  });

  texture.refresh();

  // Frame index = row * cols + col, which is what the animation configs assume.
  let index = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      texture.add(index++, 0, col * CHAR_FRAME_W, row * CHAR_FRAME_H, CHAR_FRAME_W, CHAR_FRAME_H);
    }
  }
}

/** step: 0 = idle, 1 = left foot, 2 = right foot. */
function drawCharacterFrame(ctx: Ctx, ox: number, oy: number, dir: CharDirection, step: number): void {
  const facingSide = dir === 'left' || dir === 'right';
  const bob = step === 0 ? 0 : 1;

  // Legs — alternate which one leads so the walk reads at 7fps.
  const legY = oy + 24;
  const lead = step === 1 ? -1 : step === 2 ? 1 : 0;
  fill(ctx, PALETTE.trousers, ox + 8 + (facingSide ? lead : -lead), legY, 3, 6);
  fill(ctx, PALETTE.trousersShade, ox + 13 - (facingSide ? lead : -lead), legY, 3, 6);
  fill(ctx, PALETTE.shoe, ox + 8 + (facingSide ? lead : -lead), legY + 6, 3, 2);
  fill(ctx, PALETTE.shoe, ox + 13 - (facingSide ? lead : -lead), legY + 6, 3, 2);

  // Torso — a short-sleeved dress shirt, tucked, always.
  const torsoY = oy + 14 + bob;
  fill(ctx, PALETTE.shirt, ox + 6, torsoY, 12, 11);
  fill(ctx, PALETTE.shirtShade, ox + 6, torsoY, 12, 2);
  if (facingSide) {
    fill(ctx, PALETTE.shirtShade, ox + (dir === 'left' ? 6 : 15), torsoY, 3, 11);
  }

  // Arms.
  fill(ctx, PALETTE.shirt, ox + 4, torsoY + 1, 2, 8);
  fill(ctx, PALETTE.shirt, ox + 18, torsoY + 1, 2, 8);
  fill(ctx, PALETTE.skin, ox + 4, torsoY + 9, 2, 2);
  fill(ctx, PALETTE.skin, ox + 18, torsoY + 9, 2, 2);

  // Tie — only visible from the front. From behind it is a rumour.
  if (dir === 'down') {
    fill(ctx, PALETTE.tie, ox + 11, torsoY + 1, 2, 8);
    fill(ctx, PALETTE.tie, ox + 10, torsoY + 7, 4, 3);
  }

  // Head.
  const headY = oy + 5 + bob;
  fill(ctx, PALETTE.skin, ox + 7, headY, 10, 10);
  fill(ctx, PALETTE.skinShade, ox + 7, headY + 8, 10, 2);
  fill(ctx, PALETTE.hair, ox + 6, headY - 2, 12, 4);

  if (dir === 'down') {
    fill(ctx, PALETTE.hair, ox + 9, headY + 4, 2, 2);
    fill(ctx, PALETTE.hair, ox + 14, headY + 4, 2, 2);
  } else if (dir === 'up') {
    fill(ctx, PALETTE.hair, ox + 6, headY, 12, 7);
  } else {
    const eyeX = dir === 'left' ? ox + 8 : ox + 14;
    fill(ctx, PALETTE.hair, eyeX, headY + 4, 2, 2);
    fill(ctx, PALETTE.hair, ox + (dir === 'left' ? 6 : 12), headY - 1, 6, 4);
  }
}
