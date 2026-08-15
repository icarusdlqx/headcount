import Phaser from 'phaser';
import { PALETTE, css } from '../art/palette';

/**
 * Windows 95 chrome primitives. Every panel in the game — status bar, dialogs,
 * the Friday review, the meter bars — is drawn from these two helpers so the
 * whole UI stays one consistent, slightly hostile grey.
 */

export const UI_FONT = {
  fontFamily: '"MS Sans Serif", Tahoma, Geneva, Verdana, sans-serif',
  fontSize: '12px',
  color: css(PALETTE.win95Text),
} as const;

export interface BevelOptions {
  /** "out" = a raised panel or button; "in" = a sunken well or text field. */
  style?: 'out' | 'in';
  face?: number;
}

/** Draws a 2px Win95 bevel into an existing Graphics object. */
export function drawBevel(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  options: BevelOptions = {},
): void {
  const { style = 'out', face = PALETTE.win95Face } = options;
  const topLeft = style === 'out' ? PALETTE.win95Light : PALETTE.win95Shadow;
  const bottomRight = style === 'out' ? PALETTE.win95DarkShadow : PALETTE.win95Light;
  const inner = style === 'out' ? PALETTE.win95Face : PALETTE.win95DarkShadow;

  g.fillStyle(face, 1);
  g.fillRect(x, y, w, h);

  g.fillStyle(topLeft, 1);
  g.fillRect(x, y, w, 1);
  g.fillRect(x, y, 1, h);

  g.fillStyle(bottomRight, 1);
  g.fillRect(x, y + h - 1, w, 1);
  g.fillRect(x + w - 1, y, 1, h);

  g.fillStyle(inner, 1);
  g.fillRect(x + 1, y + h - 2, w - 2, 1);
  g.fillRect(x + w - 2, y + 1, 1, h - 2);
}

export interface PanelOptions extends BevelOptions {
  /** Adds a navy title bar with this caption. */
  title?: string;
}

/**
 * A screen-space panel: bevelled box, optional title bar, and a text body.
 * Returns a Container fixed to the camera, ready to position or tween.
 */
export function createPanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  body: string,
  options: PanelOptions = {},
): Phaser.GameObjects.Container {
  const container = scene.add.container(x, y);
  const g = scene.add.graphics();
  const titleHeight = options.title ? 16 : 0;

  drawBevel(g, 0, 0, w, h, options);

  if (options.title) {
    g.fillStyle(PALETTE.win95Title, 1);
    g.fillRect(3, 3, w - 6, titleHeight - 2);
  }

  container.add(g);

  if (options.title) {
    container.add(
      scene.add.text(6, 4, options.title, { ...UI_FONT, color: css(PALETTE.win95TitleText) }).setResolution(1),
    );
  }

  const text = scene.add
    .text(7, titleHeight + 5, body, { ...UI_FONT, wordWrap: { width: w - 14 } })
    .setResolution(1);
  container.add(text);
  container.setName('panel');
  container.setScrollFactor(0);
  container.setDepth(1000);

  return container;
}
