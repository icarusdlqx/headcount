import Phaser from 'phaser';
import { BALANCE } from '../config/balance';
import { PALETTE, css } from '../art/palette';
import { UI_FONT, WIN95, drawBevel } from '../ui/Win95';
import { HUD_LAYOUT } from '../ui/Hud';
import { getDirector, type DayDirector } from '../sim/DayDirector';
import {
  clearJam,
  createMachine,
  labelForSlot,
  pressDigit,
  pressFunction,
  pressStart,
  pressStop,
  setTray,
  type FaxMachine,
  type FaxPanel,
  type FaxStep,
} from '../sim/faxMachine';
import { fill } from '../ui/format';
import { FAX_TEXT } from '../ui/faxPanelView';
import type { FaxJob } from '../sim/faxTray';

/**
 * The fax machine. A Win95 window is the chrome the game speaks through; the
 * machine inside it is an object in the world, drawn top-down in beige.
 *
 * Input is bound directly rather than through a focus-navigation system: the six
 * function keys are Q W E / A S D, mirroring the 2x3 physical block, so the
 * player's fingers map onto the panel. The keys stay UNLABELED — knowing which
 * key you are pressing is not the same as knowing what it does, and the second
 * is the puzzle.
 */

const LAYOUT = {
  w: 520,
  h: 380,
  /** The 2x3 function block. */
  keyW: 62,
  keyH: 30,
  keyGapX: 12,
  keyGapY: 10,
  keysX: 28,
  keysY: 96,
  /** The 4x3 keypad. */
  padW: 34,
  padH: 26,
  padGap: 6,
  padX: 250,
  padY: 96,
  lcdX: 28,
  lcdY: 46,
  lcdW: 300,
  lcdH: 32,
  trayW: 90,
  trayH: 34,
  trayX: 390,
  trayY: 96,
  startX: 390,
  startY: 250,
  btnW: 90,
  btnH: 34,
} as const;

/** Q W E / A S D — the top row and the bottom row of the physical block, so the
 *  player's fingers map onto the panel. */
const FUNCTION_KEYS = ['Q', 'W', 'E', 'A', 'S', 'D'] as const;

const DIGIT_KEYS = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'] as const;

export class FaxScene extends Phaser.Scene {
  private director!: DayDirector;
  private panel!: FaxPanel;
  private machine!: FaxMachine;
  private job!: FaxJob;

  private container!: Phaser.GameObjects.Container;
  private lcdText!: Phaser.GameObjects.Text;
  private keyLabels: Phaser.GameObjects.Text[] = [];
  private trayLabels: Phaser.GameObjects.Text[] = [];
  private graphics!: Phaser.GameObjects.Graphics;

  private armed = false;
  private closing = false;
  /** Frozen for the session: re-reading it mid-fax would re-rasterise a glyph
   *  under the player's eye, and stress accrued during the job belongs at the end. */
  private tier: 0 | 1 | 2 | 3 = 0;

  constructor() {
    super('Fax');
  }

  create(): void {
    this.director = getDirector(this);
    this.panel = this.director.faxPanel;
    this.tier = this.director.stressTier;
    this.closing = false;
    this.armed = false;

    const job = this.director.nextJob;
    if (!job) {
      this.closeOut(null);
      return;
    }
    this.job = job;
    this.machine = createMachine(this.panel, this.director.faxJammedOnArrival);

    this.scene.bringToTop();
    this.buildWindow();

    this.time.delayedCall(BALANCE.fax.inputLockMs, () => {
      this.armed = true;
    });

    this.bindInput();
  }

  private buildWindow(): void {
    const x = Math.round((BALANCE.view.width - LAYOUT.w) / 2);
    const y = Math.round((BALANCE.view.height - HUD_LAYOUT.chromeHeight - LAYOUT.h) / 2);

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
    drawBevel(g, 0, 0, LAYOUT.w, LAYOUT.h);
    g.fillStyle(PALETTE.win95Title, 1);
    g.fillRect(3, 3, LAYOUT.w - 6, WIN95.titleBarH - 2);
    this.container.add(
      this.add.text(7, 4, FAX_TEXT.window.title, { ...UI_FONT, color: css(PALETTE.win95TitleText) }).setResolution(1),
    );

    // The machine itself sits in a sunken well: a beige object inside the chrome.
    drawBevel(g, 8, WIN95.titleBarH + 6, LAYOUT.w - 16, LAYOUT.h - WIN95.titleBarH - 34, {
      style: 'in',
      face: PALETTE.applianceBody,
    });

    this.container.add(
      this.add
        .text(16, WIN95.titleBarH + 12, FAX_TEXT.window.model, {
          ...UI_FONT,
          color: css(PALETTE.win95Shadow),
        })
        .setResolution(1),
    );

    this.drawLcd();
    this.drawKeys();
    this.drawKeypad();
    this.drawTrays();
    this.drawActionButtons();
    this.drawCoverSheet();

    this.container.add(
      this.add
        .text(16, LAYOUT.h - 22, FAX_TEXT.window.hint, { ...UI_FONT, color: css(PALETTE.win95Shadow) })
        .setResolution(1),
    );

    this.refreshLcd();
  }

  private drawLcd(): void {
    const g = this.graphics;
    drawBevel(g, LAYOUT.lcdX, LAYOUT.lcdY, LAYOUT.lcdW, LAYOUT.lcdH, { style: 'in', face: 0x8a9a70 });
    this.lcdText = this.add
      .text(LAYOUT.lcdX + 8, LAYOUT.lcdY + 9, '', {
        ...UI_FONT,
        fontFamily: '"Courier New", monospace',
        color: '#1d2a14',
      })
      .setResolution(1);
    this.container.add(this.lcdText);
  }

  /** Six blank beige keys. Two physical tells so day one is deduction rather
   *  than enumeration: the worn key and the one beside the handset. */
  private drawKeys(): void {
    const g = this.graphics;
    for (let slot = 0; slot < 6; slot++) {
      const { kx, ky } = this.keyRect(slot);
      drawBevel(g, kx, ky, LAYOUT.keyW, LAYOUT.keyH, { face: PALETTE.applianceBody });

      if (slot === this.panel.wornSlot) {
        // Worn shiny by the previous occupant. It is COPY. It is always COPY.
        g.fillStyle(PALETTE.applianceShade, 0.55);
        g.fillRect(kx + 8, ky + 8, LAYOUT.keyW - 16, LAYOUT.keyH - 16);
      }
      if (slot === this.panel.nearHandsetSlot) {
        // The handset cradle sits against this key.
        g.fillStyle(PALETTE.applianceDark, 1);
        g.fillRect(kx - 6, ky + 4, 3, LAYOUT.keyH - 8);
      }

      const keyCap = this.add
        .text(kx + 4, ky + 3, FUNCTION_KEYS[slot] ?? '', { ...UI_FONT, color: css(PALETTE.win95Shadow) })
        .setResolution(1);
      this.container.add(keyCap);

      // The learned label: a black-on-white P-touch strip, slightly crooked.
      const label = this.add
        .text(kx + LAYOUT.keyW / 2, ky + LAYOUT.keyH - 9, '', {
          ...UI_FONT,
          backgroundColor: '#f4f4ee',
          color: '#101010',
        })
        .setOrigin(0.5, 0.5)
        .setResolution(1)
        .setPadding(3, 1, 3, 1);
      this.keyLabels.push(label);
      this.container.add(label);
    }
    this.refreshLabels();
  }

  private keyRect(slot: number): { kx: number; ky: number } {
    const col = slot % 3;
    const row = Math.floor(slot / 3);
    return {
      kx: LAYOUT.keysX + col * (LAYOUT.keyW + LAYOUT.keyGapX),
      ky: LAYOUT.keysY + row * (LAYOUT.keyH + LAYOUT.keyGapY),
    };
  }

  /** The keypad is the one part of the machine that never lies: the silkscreened
   *  function legends wear off, the moulded digits do not. "Dial 9 first"
   *  presupposes a readable 9. */
  private drawKeypad(): void {
    const g = this.graphics;
    const glyphs = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
    glyphs.forEach((glyph, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const kx = LAYOUT.padX + col * (LAYOUT.padW + LAYOUT.padGap);
      const ky = LAYOUT.padY + row * (LAYOUT.padH + LAYOUT.padGap);
      drawBevel(g, kx, ky, LAYOUT.padW, LAYOUT.padH, { face: PALETTE.applianceBody });
      this.container.add(
        this.add
          .text(kx + LAYOUT.padW / 2, ky + LAYOUT.padH / 2, glyph, UI_FONT)
          .setOrigin(0.5)
          .setResolution(1),
      );
    });
  }

  private drawTrays(): void {
    const g = this.graphics;
    for (let tray = 0; tray < 2; tray++) {
      const ty = LAYOUT.trayY + tray * (LAYOUT.trayH + 10);
      drawBevel(g, LAYOUT.trayX, ty, LAYOUT.trayW, LAYOUT.trayH, { face: PALETTE.applianceShade });

      if (tray === 1) {
        // The taped note. Nobody knows which was "the other".
        this.container.add(
          this.add
            .text(LAYOUT.trayX + 4, ty + 3, FAX_TEXT.window.trayNote, {
              ...UI_FONT,
              fontSize: '9px',
              backgroundColor: '#e8e4d0',
              color: '#3a3a30',
            })
            .setResolution(1),
        );
      }

      const label = this.add
        .text(LAYOUT.trayX + LAYOUT.trayW / 2, ty + LAYOUT.trayH - 9, '', {
          ...UI_FONT,
          backgroundColor: '#f4f4ee',
          color: '#101010',
        })
        .setOrigin(0.5, 0.5)
        .setResolution(1)
        .setPadding(3, 1, 3, 1);
      this.trayLabels.push(label);
      this.container.add(label);
    }
  }

  private drawActionButtons(): void {
    const g = this.graphics;
    drawBevel(g, LAYOUT.startX, LAYOUT.startY, LAYOUT.btnW, LAYOUT.btnH, { face: PALETTE.leafLight });
    drawBevel(g, LAYOUT.startX, LAYOUT.startY + LAYOUT.btnH + 8, LAYOUT.btnW, LAYOUT.btnH, { face: PALETTE.tie });
  }

  private drawCoverSheet(): void {
    const knowsPrefix = this.director.learned.includes('fax.prefix');
    const line = knowsPrefix ? FAX_TEXT.window.coverFaxLearned : FAX_TEXT.window.coverFax;
    const g = this.graphics;
    g.fillStyle(PALETTE.paper, 1);
    g.fillRect(28, 250, 190, 74);
    g.lineStyle(1, PALETTE.win95Shadow, 1);
    g.strokeRect(28, 250, 190, 74);

    this.container.add(
      this.add.text(36, 256, FAX_TEXT.window.coverTitle, { ...UI_FONT, color: '#202020' }).setResolution(1),
    );
    this.container.add(
      this.add
        .text(36, 276, fill(line, { ext: this.job.extension }), {
          ...UI_FONT,
          // The 9- is hand-written, in biro, because someone — you — wrote it.
          color: knowsPrefix ? '#1b2f7a' : '#202020',
        })
        .setResolution(1),
    );
    this.container.add(
      this.add
        .text(36, 296, fill(FAX_TEXT.window.coverFrom, { owner: this.ownerName() }), {
          ...UI_FONT,
          color: '#404040',
        })
        .setResolution(1),
    );
  }

  private ownerName(): string {
    if (this.job.owner === 'colleague' && this.job.colleagueId) {
      return FAX_TEXT.colleagues[this.job.colleagueId] ?? this.job.colleagueId;
    }
    return FAX_TEXT.owners[this.job.owner] ?? this.job.owner;
  }

  /** Labels appear mid-session, the moment the fact lands. That is the beat. */
  private refreshLabels(): void {
    const learned = this.director.learned;
    for (let slot = 0; slot < this.keyLabels.length; slot++) {
      const fn = labelForSlot(this.panel, slot, learned);
      const label = this.keyLabels[slot];
      if (!label) continue;
      label.setText(fn ? (FAX_TEXT.keyLabels[fn] ?? fn.toUpperCase()) : '');
      this.applyDegradation(label, slot);
    }

    const knowsTray = learned.includes('fax.tray');
    this.trayLabels.forEach((label, tray) => {
      label.setText(knowsTray ? (tray === this.panel.faxTray ? FAX_TEXT.trayLabels.fax : FAX_TEXT.trayLabels.notFax) : '');
    });
  }

  /**
   * Degrade the memory aids, never the ground truth. The LCD is never touched:
   * a stressed player is slower and funnier, never stuck, because the machine
   * still tells them honestly what happened.
   */
  private applyDegradation(label: Phaser.GameObjects.Text, slot: number): void {
    if (this.tier >= 1) {
      const jitter = BALANCE.stress.jitterPx;
      const rng = this.director.rng(`fax:jitter:${this.director.state.dayIndex}:${slot}`);
      label.setPosition(label.x + rng.int(-jitter, jitter), label.y + rng.int(-jitter, jitter));
    }
    if (this.tier >= 2) label.setAlpha(BALANCE.stress.blurAlpha);
  }

  private bindInput(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;

    FUNCTION_KEYS.forEach((key, slot) => {
      keyboard.on(`keydown-${key}`, () => this.act(() => pressFunction(this.machine, this.panel, slot)));
    });

    DIGIT_KEYS.forEach((name, digit) => {
      keyboard.on(`keydown-${name}`, () => this.act(() => pressDigit(this.machine, String(digit))));
    });

    keyboard.on('keydown-T', () => this.act(() => this.flipTray()));
    keyboard.on('keydown-SPACE', () => this.act(() => this.contextAction()));
    keyboard.on('keydown-ENTER', () =>
      this.act(() => pressStart(this.machine, this.panel, this.job, this.tier >= 2, this.job.busyRoll)),
    );
    keyboard.on('keydown-ESC', () => this.act(() => pressStop(this.machine, this.job, this.tier >= 2)));
  }

  /** Space clears a jam when there is one; otherwise it is the tray flap. */
  private contextAction(): FaxStep {
    if (this.machine.phase === 'jammed') {
      const foreign = !this.machine.creased && this.machine.jams === 0;
      return clearJam(this.machine, foreign);
    }
    return this.flipTray();
  }

  private flipTray(): FaxStep {
    return setTray(this.machine, this.machine.tray === 0 ? 1 : 0);
  }

  /** Every press: charge the minutes it cost, update the display, and close out
   *  if the step produced an outcome. */
  private act(step: () => FaxStep): void {
    if (!this.armed || this.closing) return;

    const result = step();
    if (result.minutes > 0) this.director.spendMinutes(result.minutes);
    if (result.learned) this.director.markLearned([result.learned]);

    this.refreshLcd();
    this.refreshLabels();

    if (result.outcome) this.closeOut(result);
  }

  private refreshLcd(): void {
    const map = this.machine.speaker ? FAX_TEXT.lcd.verbose : FAX_TEXT.lcd.terse;
    const template = map[this.machine.lcd.code] ?? this.machine.lcd.code;
    this.lcdText.setText(fill(template, this.machine.lcd.vars as Record<string, string | number>));
  }

  private closeOut(result: FaxStep | null): void {
    if (this.closing) return;
    this.closing = true;

    // The reward lands OUTSIDE the modal, which is what makes the walk back to
    // your cubicle feel earned. OfficeScene reads the outcome on resume.
    this.director.finishFax(result?.outcome ?? null);
    this.input.keyboard?.removeAllListeners();
    this.director.release('minigame');
    this.scene.stop();
  }
}
