import Phaser from 'phaser';
import { BALANCE } from '../config/balance';
import { PALETTE, css } from '../art/palette';
import { UI_FONT, WIN95, createButton, drawBevel, drawLeaderDots } from '../ui/Win95';
import { HUD_LAYOUT, HUD_TEXT } from '../ui/Hud';
import { CONTENT, buildDayEndView, type DayEndView } from '../ui/daySummaryView';
import { getDirector } from '../sim/DayDirector';
import { DAY_EVENTS, type DayEndInfo } from '../sim/events';
import { fill } from '../ui/format';

/**
 * Five o'clock. A Win95 modal over the frozen office, then (on Friday) the
 * weekend, then the cut to the next morning.
 *
 * This scene owns EVERY tween in the transition, because OfficeScene is paused
 * for most of it and a paused scene's tweens and timers do not advance. Anything
 * owned by Office would silently stall at 60% dim.
 *
 * M7 inserts a 'review' phase between summary and weekend and touches nothing else.
 */
export class DayEndScene extends Phaser.Scene {
  private info!: DayEndInfo;
  private view!: DayEndView;
  private dim!: Phaser.GameObjects.Rectangle;
  private dialog?: Phaser.GameObjects.Container;
  private inputArmed = false;
  private dismissed = false;

  constructor() {
    super('DayEnd');
  }

  init(data: DayEndInfo): void {
    this.info = data;
    this.dismissed = false;
    this.inputArmed = false;
  }

  create(): void {
    const { width, height } = BALANCE.view;
    const director = getDirector(this);

    this.scene.bringToTop();

    // Sized to stop at the status bar so the frozen 5:00 PM clock stays at full
    // brightness — dimming it would undercut the whole point of freezing it there.
    //
    // Note the fill is opaque and the GAME OBJECT alpha is what animates. The
    // sixth argument of add.rectangle is fillAlpha, not alpha: passing 0 there
    // makes the rectangle permanently invisible however much you tween alpha.
    this.dim = this.add
      .rectangle(0, 0, width, height - HUD_LAYOUT.chromeHeight, 0x000000)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(0)
      .setAlpha(0);

    this.fadeDim(BALANCE.dayEnd.worldDimAlpha, BALANCE.dayEnd.dimMs);

    const weekdayShort = HUD_TEXT.weekdays[this.info.weekday] ?? '';
    const weekdayLong = HUD_TEXT.weekdaysLong[this.info.weekday] ?? '';
    this.view = buildDayEndView(
      this.info,
      director.rng(`day:${this.info.dayIndex}:summary`),
      weekdayShort,
      weekdayLong,
      director.meters,
    );

    this.dialog = this.buildDialog();

    // Refuses input briefly: without it, a player still holding a movement key
    // skips their first summary without reading a word of it.
    this.time.delayedCall(BALANCE.dayEnd.dialogInputLockMs, () => {
      this.inputArmed = true;
    });

    this.input.keyboard?.on('keydown-ENTER', this.dismiss, this);
    this.input.keyboard?.on('keydown-SPACE', this.dismiss, this);
    this.input.keyboard?.on('keydown-ESC', this.dismiss, this);
  }

  /**
   * The ONLY way this scene animates the dim.
   *
   * Killing the previous tween first is not defensive noise: the opening
   * 0 -> 0.35 fade can still be in flight when a fast player dismisses the
   * dialog, and two live tweens writing the same property on the same target
   * fight frame by frame — the value stalls between them and neither onComplete
   * ever runs, which strands the whole day transition.
   */
  private fadeDim(to: number, duration: number, onComplete?: () => void): void {
    this.tweens.killTweensOf(this.dim);

    if (duration <= 0) {
      this.dim.setAlpha(to);
      onComplete?.();
      return;
    }

    this.tweens.add({
      targets: this.dim,
      alpha: to,
      duration,
      onComplete: () => onComplete?.(),
    });
  }

  private buildDialog(): Phaser.GameObjects.Container {
    const w = 420;
    const rowCount = this.view.rows.length;
    const bodyTop = WIN95.titleBarH + 8;
    const rowsTop = bodyTop + 34;
    const remarkTop = rowsTop + rowCount * WIN95.rowH + 12;
    const h = remarkTop + 46 + WIN95.buttonH + WIN95.pad;

    const x = Math.round((BALANCE.view.width - w) / 2);
    const y = Math.round((BALANCE.view.height - HUD_LAYOUT.chromeHeight - h) / 2);
    const container = this.add.container(x, y).setDepth(10);

    const g = this.add.graphics();
    drawBevel(g, 0, 0, w, h);
    g.fillStyle(PALETTE.win95Title, 1);
    g.fillRect(3, 3, w - 6, WIN95.titleBarH - 2);
    container.add(g);

    container.add(
      this.add
        .text(7, 4, this.view.title, { ...UI_FONT, color: css(PALETTE.win95TitleText) })
        .setResolution(1),
    );

    container.add(this.add.text(WIN95.pad + 2, bodyTop, this.view.heading, UI_FONT).setResolution(1));
    container.add(
      this.add
        .text(WIN95.pad + 2, bodyTop + 15, this.view.subheading, {
          ...UI_FONT,
          color: css(PALETTE.win95Shadow),
        })
        .setResolution(1),
    );

    const labelX = WIN95.pad + 2;
    const valueRight = w - WIN95.pad - 2;
    this.view.rows.forEach((row, index) => {
      const rowY = rowsTop + index * WIN95.rowH;
      const label = this.add.text(labelX, rowY, row.label, UI_FONT).setResolution(1);
      const value = this.add.text(valueRight, rowY, row.value, UI_FONT).setResolution(1).setOrigin(1, 0);

      if (row.bar === undefined) {
        drawLeaderDots(g, labelX + label.width + 4, valueRight - value.width - 4, rowY + 9);
      } else {
        // A meter row draws the same segmented well the HUD uses, so the two
        // read as the same instrument rather than two different scales.
        const wellW = 120;
        const wellX = valueRight - value.width - 10 - wellW;
        drawBevel(g, wellX, rowY + 2, wellW, 11, { style: 'in' });
        g.fillStyle(PALETTE.win95Title, 1);
        const chunks = Math.round(Math.max(0, Math.min(1, row.bar)) * 14);
        for (let c = 0; c < chunks; c++) g.fillRect(wellX + 2 + c * 8, rowY + 4, 6, 7);
      }
      container.add([label, value]);
    });

    container.add(
      this.add
        .text(labelX, remarkTop, this.view.remark, {
          ...UI_FONT,
          wordWrap: { width: w - WIN95.pad * 2 - 4 },
        })
        .setResolution(1),
    );

    const button = createButton(
      this,
      w - WIN95.pad - WIN95.buttonW,
      h - WIN95.pad - WIN95.buttonH,
      this.view.okLabel,
      () => this.dismiss(),
    );
    container.add(button.container);

    return container;
  }

  private dismiss(): void {
    // Three guards are all needed: the input lock, this boolean (keydown-ENTER
    // repeats on OS key repeat), and the weekend card's own later floor.
    if (!this.inputArmed || this.dismissed) return;
    this.dismissed = true;

    this.input.keyboard?.removeAllListeners();
    this.dialog?.destroy(true);
    this.dialog = undefined;

    if (this.info.lastOfWeek) {
      this.playWeekend(() => this.blackout());
      return;
    }
    this.blackout();
  }

  /**
   * Not a dialog. One line of MS Sans Serif on black — no window, no bevel, no
   * button. Dialogs are the office; the weekend is the absence of the office, so
   * the structure carries the joke before the writing does. You cannot interact
   * with your weekend.
   */
  private playWeekend(done: () => void): void {
    const director = getDirector(this);
    const line = director.rng(`week:${this.info.week}:weekend`).pick(CONTENT.weekend);

    this.fadeDim(1, BALANCE.dayEnd.blackoutMs, () => {
      {
        // Full-screen for the weekend: there is no office to keep legible.
        this.dim.setSize(BALANCE.view.width, BALANCE.view.height);

        const text = this.add
          .text(BALANCE.view.width / 2, BALANCE.view.height / 2, line, {
            ...UI_FONT,
            color: css(PALETTE.wallFace),
            align: 'center',
            wordWrap: { width: BALANCE.view.width - 160 },
          })
          .setOrigin(0.5)
          .setResolution(1)
          .setDepth(20)
          .setAlpha(0);

        this.tweens.add({ targets: text, alpha: 1, duration: 220 });

        let skippable = false;
        this.time.delayedCall(BALANCE.dayEnd.weekendSkipAfterMs, () => {
          skippable = true;
        });

        const finish = (): void => {
          this.input.keyboard?.removeAllListeners();
          text.destroy();
          done();
        };

        this.time.delayedCall(BALANCE.dayEnd.weekendHoldMs, finish);
        this.input.keyboard?.on('keydown', () => {
          if (skippable) finish();
        });
      }
    });
  }

  /** Full black, then the day advances underneath it. */
  private blackout(): void {
    const director = getDirector(this);

    const advance = (): void => {
      this.dim.setSize(BALANCE.view.width, BALANCE.view.height);
      this.dim.setAlpha(1);

      // Hold the transition BEFORE releasing the summary, so the clock stays
      // held while OfficeScene resumes and performs its morning reset.
      director.hold('dayTransition');
      director.events.once(DAY_EVENTS.DAY_ADVANCED, () => this.wake());
      director.advanceDay(Date.now());
      director.release('summary');
    };

    // The weekend card already took it to full black.
    this.fadeDim(1, this.dim.alpha >= 1 ? 0 : BALANCE.dayEnd.blackoutMs, advance);
  }

  /** OfficeScene has repositioned the player and reset the camera by now. */
  private wake(): void {
    const director = getDirector(this);
    this.fadeDim(0, BALANCE.dayEnd.wakeMs, () => {
      director.beginDay(Date.now());
      director.release('dayTransition');
      this.scene.stop();
    });
  }
}

/** Exported for the morning opener, which OfficeScene shows on DAY_START. */
export function morningOpener(
  dayIndex: number,
  weekday: number,
  rng: { pick<T>(items: readonly T[]): T },
): string {
  const weekdayLong = HUD_TEXT.weekdaysLong[weekday] ?? '';
  if (dayIndex === 0) return fill(rng.pick(CONTENT.morning.first), { weekdayLong });
  const pool = weekday === 0 ? CONTENT.morning.monday : CONTENT.morning.midweek;
  return fill(rng.pick(pool), { weekdayLong });
}
