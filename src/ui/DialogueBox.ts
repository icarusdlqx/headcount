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
  /** Grows when choices are showing; a fixed tall box looks empty for one line. */
  h: 96,
  hWithChoices: 158,
  /** Above the message line's slot, clear of the meter tray. */
  bottomGap: 46,
  choiceH: 16,
} as const;

export class DialogueBox {
  private readonly container: Phaser.GameObjects.Container;
  private readonly nameText: Phaser.GameObjects.Text;
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly lineText: Phaser.GameObjects.Text;
  private readonly footerText: Phaser.GameObjects.Text;
  private readonly choiceTexts: Phaser.GameObjects.Text[] = [];
  private readonly frame: Phaser.GameObjects.Graphics;
  private choiceCount = 0;

  constructor(scene: Phaser.Scene) {
    const x = Math.round((BALANCE.view.width - BOX.w) / 2);
    const y = BALANCE.view.height - HUD_LAYOUT.chromeHeight - BOX.h - BOX.bottomGap;

    this.container = scene.add.container(x, y).setScrollFactor(0).setDepth(1200).setVisible(false);

    this.frame = scene.add.graphics();
    this.container.add(this.frame);
    this.drawFrame(BOX.h);

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

    // Four is the most any node offers; built once and shown as needed so a
    // conversation never allocates mid-sentence.
    for (let i = 0; i < 4; i++) {
      const choice = scene.add
        .text(20, WIN95.titleBarH + 42 + i * BOX.choiceH, '', UI_FONT)
        .setResolution(1)
        .setVisible(false);
      this.choiceTexts.push(choice);
      this.container.add(choice);
    }
  }

  private drawFrame(height: number): void {
    this.frame.clear();
    drawBevel(this.frame, 0, 0, BOX.w, height);
    this.frame.fillStyle(PALETTE.win95Title, 1);
    this.frame.fillRect(3, 3, BOX.w - 6, WIN95.titleBarH - 2);
  }

  /**
   * Present numbered options. Numbered rather than a focus ring because the
   * player's hands are already on the number row from dialling the fax, and a
   * visible "2" is unambiguous in a way a highlight is not.
   */
  showChoices(line: string, choices: readonly string[], footer: string): void {
    this.choiceCount = Math.min(choices.length, this.choiceTexts.length);
    this.drawFrame(BOX.hWithChoices);
    this.container.setY(BALANCE.view.height - HUD_LAYOUT.chromeHeight - BOX.hWithChoices - BOX.bottomGap);

    this.lineText.setText(line);
    this.footerText.setPosition(12, BOX.hWithChoices - 18).setText(footer);

    this.choiceTexts.forEach((text, i) => {
      if (i < this.choiceCount) text.setText(`${i + 1})  ${choices[i]}`).setVisible(true);
      else text.setVisible(false);
    });
    this.container.setVisible(true);
  }

  /** How many options are live, so the scene can ignore a stray keypress. */
  get choices(): number {
    return this.choiceCount;
  }

  private clearChoices(): void {
    this.choiceCount = 0;
    for (const text of this.choiceTexts) text.setVisible(false);
    this.drawFrame(BOX.h);
    this.container.setY(BALANCE.view.height - HUD_LAYOUT.chromeHeight - BOX.h - BOX.bottomGap);
    this.footerText.setPosition(12, BOX.h - 18);
  }

  get isOpen(): boolean {
    return this.container.visible;
  }

  show(name: string, title: string, line: string, footer: string): void {
    this.clearChoices();
    this.nameText.setText(name);
    this.titleText.setText(title);
    this.lineText.setText(line);
    this.footerText.setText(footer);
    this.container.setVisible(true);
  }

  /** Change only the speech and footer, keeping the header stable mid-chat. */
  say(line: string, footer: string): void {
    this.clearChoices();
    this.lineText.setText(line);
    this.footerText.setText(footer);
  }

  hide(): void {
    this.clearChoices();
    this.container.setVisible(false);
  }
}
