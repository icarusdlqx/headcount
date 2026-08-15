import Phaser from 'phaser';
import { PALETTE } from '../art/palette';
import { BALANCE } from '../config/balance';
import { UI_FONT, drawBevel } from './Win95';
import { formatClock } from './format';
import { MeterBar } from './MeterBar';
import { METER, METER_KEYS, type MeterKey } from '../sim/meters';
import hudContent from '../content/hud.json';

/**
 * The heads-up display: a Win95 status bar with a room readout, a hint, and a
 * clock, plus a transient message line.
 *
 * M3 adds the three meters and Stress to this same bar.
 */

interface HudContent {
  weekdays: string[];
  weekdaysLong: string[];
  meridiem: string[];
  timeFormat: string;
  lunch: string;
  hints: {
    base: string;
    atFax: string;
    faxDone: string;
    faxLate: string;
    objective: string;
    objectiveDone: string;
  };
  meters: Record<string, string>;
  roomUnknown: string;
}

export const HUD_TEXT = hudContent as HudContent;

/** Layout geometry lives here, beside the code that draws it. */
export const HUD_LAYOUT = {
  barHeight: 24,
  /** The meter tray sits directly on top of the status bar, separated by a groove
   *  so the two read as one object (the system) rather than two widgets. */
  meterTrayHeight: 34,
  /** Everything above the chrome measures off THIS, never off barHeight — the
   *  message panel used to be positioned off the bar and ended up drawn straight
   *  through the meters. */
  chromeHeight: 58,
  messageHeight: 40,
  paneGap: 3,
  roomPaneX: 3,
  roomPaneW: 220,
  clockPaneW: 118,
  hintPaneX: 229,
} as const;

export class Hud {
  private readonly scene: Phaser.Scene;
  private readonly roomText: Phaser.GameObjects.Text;
  private readonly hintText: Phaser.GameObjects.Text;
  private readonly dayText: Phaser.GameObjects.Text;
  private readonly timeText: Phaser.GameObjects.Text;
  private readonly messageText: Phaser.GameObjects.Text;
  private readonly messagePanel: Phaser.GameObjects.Graphics;
  private readonly meterBars: { key: MeterKey; bar: MeterBar }[] = [];
  private messageTimer?: Phaser.Time.TimerEvent;

  /** Diff guards. setText re-rasterises a canvas and re-uploads a GPU texture,
   *  which is materially worse than the per-frame allocation the project bans. */
  private lastClockMinute = -1;
  private lastWeekday = -1;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const { width, height } = BALANCE.view;
    const barY = height - HUD_LAYOUT.barHeight;
    const trayY = height - HUD_LAYOUT.chromeHeight;
    const clockPaneX = width - HUD_LAYOUT.paneGap - HUD_LAYOUT.clockPaneW;
    const hintPaneW = clockPaneX - HUD_LAYOUT.paneGap - HUD_LAYOUT.hintPaneX;
    const paneY = barY + 4;
    const paneH = HUD_LAYOUT.barHeight - 8;

    const bar = scene.add.graphics().setScrollFactor(0).setDepth(1000);
    drawBevel(bar, 0, trayY, width, HUD_LAYOUT.meterTrayHeight);
    drawBevel(bar, 0, barY, width, HUD_LAYOUT.barHeight);
    drawBevel(bar, HUD_LAYOUT.roomPaneX, paneY, HUD_LAYOUT.roomPaneW, paneH, { style: 'in' });
    drawBevel(bar, HUD_LAYOUT.hintPaneX, paneY, hintPaneW, paneH, { style: 'in' });
    // The clock goes where Windows put it, so the placement is a free joke.
    drawBevel(bar, clockPaneX, paneY, HUD_LAYOUT.clockPaneW, paneH, { style: 'in' });

    const textY = barY + 7;
    this.roomText = this.label(8, textY);
    this.hintText = this.label(HUD_LAYOUT.hintPaneX + 5, textY);
    this.hintText.setText(HUD_TEXT.hints.base);

    // Two anchors rather than one concatenated string: MS Sans Serif is
    // proportional, so a single left-aligned string makes AM/PM jump sideways
    // when the hour rolls from 9 to 10.
    this.dayText = this.label(clockPaneX + 6, textY);
    this.timeText = this.label(clockPaneX + HUD_LAYOUT.clockPaneW - 6, textY).setOrigin(1, 0);

    // Measured off the whole chrome, not the status bar: at 34px of meters the
    // old formula put the panel straight through the first three of them.
    const msgY = height - HUD_LAYOUT.chromeHeight - HUD_LAYOUT.messageHeight - 6;
    this.messagePanel = scene.add.graphics().setScrollFactor(0).setDepth(1000).setVisible(false);
    drawBevel(this.messagePanel, 8, msgY, width - 16, HUD_LAYOUT.messageHeight);

    this.messageText = scene.add
      .text(16, msgY + 8, '', { ...UI_FONT, wordWrap: { width: width - 32 } })
      .setScrollFactor(0)
      .setDepth(1001)
      .setVisible(false)
      .setResolution(1);

    this.buildMeters(scene, trayY);
  }

  /** Five equal cells across the tray. Stress is drawn inverted because high is
   *  bad; every bar also prints its number, so colour is never the only signal. */
  private buildMeters(scene: Phaser.Scene, trayY: number): void {
    const { width } = BALANCE.view;
    const pad = 3;
    const gap = 3;
    const cells = METER_KEYS.length;
    const cellW = Math.floor((width - pad * 2 - gap * (cells - 1)) / cells);

    METER_KEYS.forEach((key, index) => {
      const x = pad + index * (cellW + gap);
      const label = HUD_TEXT.meters[key] ?? key;
      const bar = new MeterBar(scene, x, trayY + 4, cellW, label, { inverted: key === METER.stress });
      this.meterBars.push({ key, bar });
    });
  }

  /** Safe to call every frame — each bar diff-guards its own redraw. */
  setMeters(meters: Record<string, number>): void {
    for (const { key, bar } of this.meterBars) bar.set(meters[key] ?? 0);
  }

  private label(x: number, y: number): Phaser.GameObjects.Text {
    return this.scene.add.text(x, y, '', UI_FONT).setScrollFactor(0).setDepth(1001).setResolution(1);
  }

  setRoom(name: string): void {
    if (this.roomText.text !== name) this.roomText.setText(name);
  }

  setHint(line: string): void {
    if (this.hintText.text !== line) this.hintText.setText(line);
  }

  /**
   * Diff-guarded on both arguments, so this is safe to call every frame and
   * costs nothing on the ~96 frames a day where it actually changes.
   */
  setClock(minute: number, weekday: number): void {
    if (minute === this.lastClockMinute && weekday === this.lastWeekday) return;
    this.lastClockMinute = minute;
    this.lastWeekday = weekday;

    this.timeText.setText(formatClock(minute, HUD_TEXT.timeFormat, HUD_TEXT.meridiem));

    // Inert for now; M4's schedules key off the same hour.
    const hour24 = BALANCE.clock.startHour + Math.floor(minute / 60);
    const atLunch = BALANCE.clock.lunchHour > 0 && hour24 === BALANCE.clock.lunchHour;
    const day = atLunch ? HUD_TEXT.lunch : (HUD_TEXT.weekdays[weekday] ?? '');
    if (this.dayText.text !== day) this.dayText.setText(day);
  }

  /** Shows a line in the message panel, replacing whatever was there. */
  say(line: string, holdMs: number = BALANCE.ui.messageHoldMs): void {
    this.messageText.setText(line).setVisible(true);
    this.messagePanel.setVisible(true);
    this.messageTimer?.remove();
    this.messageTimer = this.scene.time.delayedCall(holdMs, () => {
      this.messageText.setVisible(false);
      this.messagePanel.setVisible(false);
    });
  }

  /**
   * Hide the message and kill its pending timer. Called at the day boundary:
   * otherwise a stale flavour line sits frozen under the summary dialog, and its
   * timer then hides the NEXT morning's opener several seconds early.
   */
  clear(): void {
    this.messageTimer?.remove();
    this.messageTimer = undefined;
    this.messageText.setVisible(false);
    this.messagePanel.setVisible(false);
  }
}

/**
 * The fluorescent wash: a faint sickly-green overlay with an irregular flicker,
 * fixed to the camera and drawn above the world but below the UI.
 */
export function createFluorescentOverlay(scene: Phaser.Scene): Phaser.GameObjects.Rectangle {
  const { width, height } = BALANCE.view;
  const baseAlpha = 0.07;
  const overlay = scene.add
    .rectangle(0, 0, width, height, PALETTE.fluorescent, baseAlpha)
    .setOrigin(0, 0)
    .setScrollFactor(0)
    .setDepth(900)
    .setBlendMode(Phaser.BlendModes.SCREEN);
  overlay.setData('baseAlpha', baseAlpha);

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
          { alpha: baseAlpha, duration: 120 },
        ],
      });
    },
  });

  return overlay;
}
