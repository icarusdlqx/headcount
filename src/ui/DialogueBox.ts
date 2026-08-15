import Phaser from 'phaser';
import { PALETTE, css } from '../art/palette';
import { BALANCE } from '../config/balance';
import { UI_FONT, WIN95, drawBevel } from './Win95';
import { HUD_LAYOUT } from './Hud';

/**
 * The conversation panel: a Win95 window low on the screen with the speaker's
 * name in the title bar, one line of speech, and a footer telling the player
 * what their keys do.
 *
 * Presentation only — OfficeScene owns the conversation state machine. This
 * lives INSIDE OfficeScene (non-modal 'dialogue' pause), so the world stays
 * visible and frozen behind it: a conversation is not a system dialog, it is a
 * person standing in front of you.
 */

const BOX = {
  w: 620,
  h: 96,
  /** Above the message line's slot, clear of the meter tray. */
  bottomGap: 56,
} as const;

export class DialogueBox {
  private readonly container: Phaser.GameObjects.Container;
  private readonly nameText: Phaser.GameObjects.Text;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly lineText: Phaser.GameObjects.Text;
  private readonly footerText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    const x = Math.round((BALANCE.view.width - BOX.w) / 2);
    const y = BALANCE.view.height - HUD_LAYOUT.chromeHeight - BOX.h - BOX.bottomGap;

    this.container = scene.add.container(x, y).setScrollFactor(0).setDepth(1200).setVisible(false);

    const g = scene.add.graphics();
    drawBevel(g, 0, 0, BOX.w, BOX.h);
    g.fillStyle(PALETTE.win95Title, 1);
    g.fillRect(3, 3, BOX.w - 6, WIN95.titleBarH - 2);
    this.container.add(g);

    this.nameText = scene.add
      .text(7, 4, '', { ...UI_FONT, color: css(PALETTE.win95TitleText) })
      .setResolution(1);
    this.titleText = scene.add
      .text(BOX.w - 7, 4, '', { ...UI_FONT, color: css(PALETTE.win95TitleText) })
      .setOrigin(1, 0)
      .setResolution(1);
    this.lineText = scene.add
      .text(12, WIN95.titleBarH + 10, '', { ...UI_FONT, wordWrap: { width: BOX.w - 24 } })
      .setResolution(1);
    this.footerText = scene.add
      .text(12, BOX.h - 18, '', { ...UI_FONT, color: css(PALETTE.win95Shadow) })
      .setResolution(1);

    this.container.add([this.nameText, this.titleText, this.lineText, this.footerText]);
  }

  get isOpen(): boolean {
    return this.container.visible;
  }

  show(name: string, title: string, line: string, footer: string): void {
    this.nameText.setText(name);
    this.titleText.setText(title);
    this.lineText.setText(line);
    this.footerText.setText(footer);
    this.container.setVisible(true);
  }

  /** Change only the speech and footer, keeping the header stable mid-chat. */
  say(line: string, footer: string): void {
    this.lineText.setText(line);
    this.footerText.setText(footer);
  }

  hide(): void {
    this.container.setVisible(false);
  }
}
