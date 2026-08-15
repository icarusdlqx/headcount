import Phaser from 'phaser';
import { PALETTE } from '../art/palette';
import { BALANCE } from '../config/balance';
import { UI_FONT, drawBevel } from './Win95';

/**
 * The M1 heads-up display: a Win95 status bar and a transient message line.
 *
 * M3 adds the three meters, Stress and Visibility to this same bar. Keeping the
 * bar a single object now means those are added in one place later.
 */
export class Hud {
  private readonly scene: Phaser.Scene;
  private readonly roomText: Phaser.GameObjects.Text;
  private readonly messageText: Phaser.GameObjects.Text;
  private readonly messagePanel: Phaser.GameObjects.Graphics;
  private messageTimer?: Phaser.Time.TimerEvent;

  private static readonly BAR_HEIGHT = 24;
  private static readonly MESSAGE_HEIGHT = 40;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const { width, height } = BALANCE.view;
    const barY = height - Hud.BAR_HEIGHT;

    const bar = scene.add.graphics().setScrollFactor(0).setDepth(1000);
    drawBevel(bar, 0, barY, width, Hud.BAR_HEIGHT);
    drawBevel(bar, 3, barY + 4, 220, Hud.BAR_HEIGHT - 8, { style: 'in' });
    drawBevel(bar, 229, barY + 4, width - 232, Hud.BAR_HEIGHT - 8, { style: 'in' });

    this.roomText = scene.add.text(8, barY + 7, '', UI_FONT).setScrollFactor(0).setDepth(1001).setResolution(1);
    scene.add
      .text(234, barY + 7, 'Arrows / WASD to walk  ·  Shift to walk with purpose  ·  E to look', UI_FONT)
      .setScrollFactor(0)
      .setDepth(1001)
      .setResolution(1);

    const msgY = barY - Hud.MESSAGE_HEIGHT - 6;
    this.messagePanel = scene.add.graphics().setScrollFactor(0).setDepth(1000).setVisible(false);
    drawBevel(this.messagePanel, 8, msgY, width - 16, Hud.MESSAGE_HEIGHT);

    this.messageText = scene.add
      .text(16, msgY + 8, '', { ...UI_FONT, wordWrap: { width: width - 32 } })
      .setScrollFactor(0)
      .setDepth(1001)
      .setVisible(false)
      .setResolution(1);
  }

  setRoom(name: string): void {
    if (this.roomText.text !== name) this.roomText.setText(name);
  }

  /** Shows a line in the message panel, replacing whatever was there. */
  say(line: string, holdMs = 3200): void {
    this.messageText.setText(line).setVisible(true);
    this.messagePanel.setVisible(true);
    this.messageTimer?.remove();
    this.messageTimer = this.scene.time.delayedCall(holdMs, () => {
      this.messageText.setVisible(false);
      this.messagePanel.setVisible(false);
    });
  }
}

/**
 * The fluorescent wash: a faint sickly-green overlay with an irregular flicker,
 * fixed to the camera and drawn above everything except the UI.
 */
export function createFluorescentOverlay(scene: Phaser.Scene): Phaser.GameObjects.Rectangle {
  const { width, height } = BALANCE.view;
  const overlay = scene.add
    .rectangle(0, 0, width, height, PALETTE.fluorescent, 0.07)
    .setOrigin(0, 0)
    .setScrollFactor(0)
    .setDepth(900)
    .setBlendMode(Phaser.BlendModes.SCREEN);

  // A tube on its way out. Long calm stretches, then a stutter.
  scene.time.addEvent({
    delay: 2400,
    loop: true,
    callback: () => {
      scene.tweens.chain({
        targets: overlay,
        tweens: [
          { alpha: 0.02, duration: 45 },
          { alpha: 0.1, duration: 35 },
          { alpha: 0.04, duration: 60 },
          { alpha: 0.07, duration: 120 },
        ],
      });
    },
  });

  return overlay;
}
