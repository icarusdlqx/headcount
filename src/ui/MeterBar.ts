import Phaser from 'phaser';
import { PALETTE } from '../art/palette';
import { BALANCE } from '../config/balance';
import { UI_FONT, drawBevel } from './Win95';

/**
 * A Windows 95 progress bar: a sunken well of discrete blue chunks.
 *
 * Deliberately segmented and un-tweened. A smooth animated fill is a modern
 * idiom; a bar that lurches one chunk at a time is what the period actually
 * looked like, it is cheaper, and a meter that moves in visible steps is easier
 * to read at a glance than one that slides.
 *
 * Every bar also prints its number. Colour alone must never be the only channel:
 * Stress being red and Productivity being blue is a nicety, not the information.
 */

export const METER_BAR = {
  labelH: 13,
  wellH: 13,
  /** Chunk width plus the gap after it. Win95 used 6+2 at this scale. */
  chunkW: 6,
  chunkGap: 2,
  chunkInset: 2,
} as const;

export interface MeterBarOptions {
  /** High is bad — drawn in the warning colour. */
  readonly inverted?: boolean;
}

export class MeterBar {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly valueText: Phaser.GameObjects.Text;
  private readonly x: number;
  private readonly y: number;
  private readonly width: number;
  private readonly inverted: boolean;

  /** Diff guard: setText re-rasterises a canvas and re-uploads a texture, which
   *  is worse than the per-frame allocation the project rule bans. */
  private lastChunks = -1;
  private lastShown = -1;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    label: string,
    options: MeterBarOptions = {},
  ) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.inverted = options.inverted ?? false;

    this.graphics = scene.add.graphics().setScrollFactor(0).setDepth(1000);

    scene.add
      .text(x, y, label, UI_FONT)
      .setScrollFactor(0)
      .setDepth(1001)
      .setResolution(1);

    this.valueText = scene.add
      .text(x + width, y, '', UI_FONT)
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(1001)
      .setResolution(1);

    drawBevel(this.graphics, x, y + METER_BAR.labelH, width, METER_BAR.wellH, { style: 'in' });
  }

  /** Safe to call every frame: redraws only when the rendered chunk count or the
   *  printed integer actually changes, which is a few times a minute. */
  set(value: number): void {
    const clamped = Math.min(BALANCE.meters.max, Math.max(BALANCE.meters.min, value));
    const shown = Math.round(clamped);

    const period = METER_BAR.chunkW + METER_BAR.chunkGap;
    const inner = this.width - METER_BAR.chunkInset * 2;
    const total = Math.max(1, Math.floor(inner / period));
    const chunks = Math.round((clamped / BALANCE.meters.max) * total);

    if (chunks === this.lastChunks && shown === this.lastShown) return;

    if (shown !== this.lastShown) {
      this.lastShown = shown;
      this.valueText.setText(String(shown));
    }

    if (chunks !== this.lastChunks) {
      this.lastChunks = chunks;
      this.redraw(chunks, total);
    }
  }

  private redraw(chunks: number, total: number): void {
    const g = this.graphics;
    const wellY = this.y + METER_BAR.labelH;
    g.clear();
    drawBevel(g, this.x, wellY, this.width, METER_BAR.wellH, { style: 'in' });

    const colour = this.inverted ? PALETTE.tie : PALETTE.win95Title;
    g.fillStyle(colour, 1);

    const period = METER_BAR.chunkW + METER_BAR.chunkGap;
    const startX = this.x + METER_BAR.chunkInset;
    for (let i = 0; i < Math.min(chunks, total); i++) {
      g.fillRect(startX + i * period, wellY + 2, METER_BAR.chunkW, METER_BAR.wellH - 4);
    }
  }
}
