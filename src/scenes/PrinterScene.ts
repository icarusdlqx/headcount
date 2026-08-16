import Phaser from 'phaser';
import { BALANCE } from '../config/balance';
import { PALETTE, css } from '../art/palette';
import { UI_FONT, WIN95, drawBevel } from '../ui/Win95';
import { HUD_LAYOUT } from '../ui/Hud';
import { getDirector, type DayDirector } from '../sim/DayDirector';
import { PRINTER_TEXT } from '../ui/printerView';
import {
  DOORS,
  openDoor,
  pull,
  readingAt,
  walkAway,
  type PrinterMachine,
  type PrinterStep,
} from '../sim/printer';

/**
 * The REGENT 4ML-e, which is always jammed.
 *
 * MODAL, reusing the existing 'minigame' pause reason — you are kneeling with
 * the lid up and cannot see the aisle, and deliberation must be free because the
 * puzzle is a diagnosis with a right answer to reason out. Verified from the
 * source rather than assumed: neither reporter's schedule ever enters this room,
 * so the "world is still watching you" fiction that justifies the non-modal
 * pattern is factually false at this tile.
 *
 * DO NOT ADD A 'printer' PauseReason. samplePresence() derives posture from
 * modality, and presence.busy is the only posture with zero drift — a new reason
 * would make a printer session bleed Standing while an identical fax jam three
 * tiles away costs nothing, retuning M3's economy with no test failing.
 */
export class PrinterScene extends Phaser.Scene {
  private director!: DayDirector;
  private machine!: PrinterMachine;
  private container!: Phaser.GameObjects.Container;
  private graphics!: Phaser.GameObjects.Graphics;
  private lcdText!: Phaser.GameObjects.Text;
  private noteText!: Phaser.GameObjects.Text;
  /** Rebuilt every create(), so these MUST be cleared — the fax shipped a bug
   *  where class-field arrays accumulated dead Text objects across sessions. */
  private doorLabels: Phaser.GameObjects.Text[] = [];

  private armed = false;
  private closing = false;
  private witnessed = false;

  constructor() {
    super('Printer');
  }

  create(): void {
    this.director = getDirector(this);
    this.machine = this.director.printerMachine;
    this.witnessed = this.director.printerWitnessed;
    this.armed = false;
    this.closing = false;
    this.doorLabels = [];

    this.scene.bringToTop();
    this.build();
    this.time.delayedCall(BALANCE.printer.inputLockMs, () => {
      this.armed = true;
    });

    DOORS.forEach((door) => {
      this.input.keyboard?.on(`keydown-${door}`, () => this.act(() => openDoor(this.machine, door)));
    });
    this.input.keyboard?.on('keydown-ENTER', () => this.act(() => pull(this.machine, this.witnessed)));
    this.input.keyboard?.on('keydown-ESC', () => this.act(() => walkAway(this.machine, this.witnessed)));
  }

  private build(): void {
    const w = 480;
    const h = 300;
    const x = Math.round((BALANCE.view.width - w) / 2);
    const y = Math.round((BALANCE.view.height - HUD_LAYOUT.chromeHeight - h) / 2);

    this.add
      .rectangle(0, 0, BALANCE.view.width, BALANCE.view.height - HUD_LAYOUT.chromeHeight, 0x000000)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(0)
      .setAlpha(BALANCE.dayEnd.worldDimAlpha);

    this.container = this.add.container(x, y).setDepth(10);
    this.graphics = this.add.graphics();
    this.container.add(this.graphics);

    const g = this.graphics;
    drawBevel(g, 0, 0, w, h);
    g.fillStyle(PALETTE.win95Title, 1);
    g.fillRect(3, 3, w - 6, WIN95.titleBarH - 2);
    this.container.add(
      this.add
        .text(7, 4, PRINTER_TEXT.window.title, { ...UI_FONT, color: css(PALETTE.win95TitleText) })
        .setResolution(1),
    );

    // The machine: a beige slab in a sunken well.
    drawBevel(g, 10, WIN95.titleBarH + 8, w - 20, h - WIN95.titleBarH - 44, {
      style: 'in',
      face: PALETTE.applianceBody,
    });
    this.container.add(
      this.add
        .text(20, WIN95.titleBarH + 14, PRINTER_TEXT.window.model, { ...UI_FONT, color: css(PALETTE.win95Shadow) })
        .setResolution(1),
    );

    // LCD.
    drawBevel(g, 20, WIN95.titleBarH + 34, 200, 26, { style: 'in', face: 0x8a9a70 });
    this.lcdText = this.add
      .text(28, WIN95.titleBarH + 41, '', { ...UI_FONT, fontFamily: '"Courier New", monospace', color: '#1d2a14' })
      .setResolution(1);
    this.container.add(this.lcdText);

    // Four door plates down the machine, in paper-path order.
    DOORS.forEach((door, index) => {
      const dx = 24 + index * 108;
      const dy = WIN95.titleBarH + 80;
      drawBevel(g, dx, dy, 96, 84, { face: PALETTE.applianceShade });
      this.container.add(
        this.add.text(dx + 6, dy + 5, door, { ...UI_FONT, color: css(PALETTE.win95Text) }).setResolution(1),
      );

      const label = this.add
        .text(dx + 48, dy + 46, '', {
          ...UI_FONT,
          fontSize: '10px',
          align: 'center',
          wordWrap: { width: 88 },
        })
        .setOrigin(0.5, 0.5)
        .setResolution(1);
      this.doorLabels.push(label);
      this.container.add(label);
    });

    this.noteText = this.add
      .text(20, h - 38, '', { ...UI_FONT, color: css(PALETTE.win95Shadow), wordWrap: { width: w - 40 } })
      .setResolution(1);
    this.container.add(this.noteText);

    this.container.add(
      this.add
        .text(20, h - 20, PRINTER_TEXT.window.hint, { ...UI_FONT, color: css(PALETTE.win95Shadow) })
        .setResolution(1),
    );

    this.refresh();
  }

  /** Doors you have opened keep showing what you found — the information you
   *  bought stays bought for this incident. */
  private refresh(): void {
    this.lcdText.setText(PRINTER_TEXT.lcd[this.machine.lcd] ?? this.machine.lcd);

    DOORS.forEach((door, index) => {
      const label = this.doorLabels[index];
      if (!label) return;
      if (!this.machine.seen.includes(door)) {
        label.setText('');
        return;
      }
      const reading = readingAt(this.machine, door);
      label.setText(PRINTER_TEXT.lcd[`read.${reading}`] ?? '');
      label.setColor(reading === 'edgeFree' ? '#1b5e20' : reading === 'goesInFurther' ? '#8a3b3b' : '#5c5b4e');
    });

    const sawDiagram = this.machine.seen.includes('A');
    this.noteText.setText(
      sawDiagram
        ? this.director.learned.includes('printer.diagram')
          ? PRINTER_TEXT.window.diagramLearned
          : PRINTER_TEXT.window.diagram
        : '',
    );
  }

  private act(step: () => PrinterStep): void {
    if (!this.armed || this.closing) return;

    const result = step();
    if (result.minutes > 0) this.director.spendMinutes(result.minutes);
    if (result.learned) this.director.markLearned([result.learned]);

    this.refresh();
    if (result.outcome) {
      this.closing = true;
      this.director.finishPrinter(result.outcome);
      this.input.keyboard?.removeAllListeners();
      this.director.release('minigame');
      this.scene.stop();
    }
  }
}
