import Phaser from 'phaser';
import { PALETTE, css } from '../art/palette';
import { BALANCE } from '../config/balance';
import { UI_FONT, WIN95, drawBevel } from './Win95';
import { HUD_LAYOUT } from './Hud';
import { NPC_TEXT } from './npcTalk';
import {
  drawFromStock,
  hasAnyMove,
  isRed,
  moveToFoundation,
  moveToPile,
  topOf,
  type SolitaireState,
} from '../sim/solitaire';

/**
 * The card table.
 *
 * An in-scene overlay, NOT a Phaser Scene and NOT a pause reason. The clock keeps
 * running, the cast keeps walking, and Dale can walk up behind you while you are
 * looking at cards — which is the entire mechanic. The fax is modal because it
 * bills per action and deliberation must be free; this is its exact inverse.
 *
 * It deliberately covers your cubicle mouth. You are supposed to be watching the
 * cards instead of the aisle. That is the trap, and it is why the CRT reflection
 * along the top edge is the only warning you get.
 */

const BOARD = {
  w: 560,
  h: 250,
  cardW: 44,
  cardH: 62,
  gap: 12,
  pileTop: 92,
  /** How far down a stacked card peeks out from the one above it. */
  stagger: 15,
  reflectionH: 12,
} as const;

export type BoardKey = 'left' | 'right' | 'up' | 'confirm' | 'escape';

export class SolitaireBoard {
  private readonly container: Phaser.GameObjects.Container;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly labels: Phaser.GameObjects.Text[] = [];
  private readonly statusText: Phaser.GameObjects.Text;
  private readonly reflection: Phaser.GameObjects.Rectangle;
  private readonly scene: Phaser.Scene;

  private state: SolitaireState | null = null;
  /** -1 = the waste, 0..n = a tableau pile. */
  private cursor = -1;
  private lastReflection = -1;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const x = Math.round((BALANCE.view.width - BOARD.w) / 2);
    const y = BALANCE.view.height - HUD_LAYOUT.chromeHeight - BOARD.h - 40;

    this.container = scene.add.container(x, y).setScrollFactor(0).setDepth(1150).setVisible(false);
    this.graphics = scene.add.graphics();
    this.container.add(this.graphics);

    this.container.add(
      scene.add
        .text(7, 4, NPC_TEXT.fluff.cards.title, { ...UI_FONT, color: css(PALETTE.win95TitleText) })
        .setResolution(1),
    );

    /**
     * The CRT reflection: a band along the top of the screen that darkens when
     * somebody who files reports can read your monitor. It is the only warning
     * the player gets once the board is open, so it is deliberately the most
     * legible thing on it.
     */
    this.reflection = scene.add
      .rectangle(8, WIN95.titleBarH + 6, BOARD.w - 16, BOARD.reflectionH, 0x000000, 0)
      .setOrigin(0, 0);
    this.container.add(this.reflection);

    this.statusText = scene.add
      .text(10, BOARD.h - 18, NPC_TEXT.fluff.cards.hint, { ...UI_FONT, color: css(PALETTE.win95Shadow) })
      .setResolution(1);
    this.container.add(this.statusText);
  }

  get isOpen(): boolean {
    return this.container.visible;
  }

  open(state: SolitaireState): void {
    this.state = state;
    this.cursor = 0;
    this.container.setVisible(true);
    this.redraw();
  }

  /** No tween on hide, ever. A fade is the one thing you cannot afford when your
   *  boss appears at the end of the aisle. */
  hide(): void {
    this.container.setVisible(false);
  }

  /** 0..1 — how readable your screen is to somebody who reports. */
  setExposure(screen: number): void {
    const level = Math.round(Math.min(1, Math.max(0, screen)) * 10);
    if (level === this.lastReflection) return;
    this.lastReflection = level;
    this.reflection.setFillStyle(0x1a1a22, level / 10);
  }

  press(key: BoardKey): void {
    const state = this.state;
    if (!state) return;
    const pileCount = state.piles.length;

    switch (key) {
      case 'left':
        this.cursor = this.cursor <= -1 ? pileCount - 1 : this.cursor - 1;
        break;
      case 'right':
        this.cursor = this.cursor >= pileCount - 1 ? -1 : this.cursor + 1;
        break;
      case 'up':
        moveToFoundation(state, this.cursor);
        break;
      case 'confirm':
        // Space draws from the stock, or redeals a dead hand.
        if (!hasAnyMove(state)) break;
        drawFromStock(state);
        break;
      default:
        return;
    }
    this.redraw();
  }

  /** Move the selected card onto a numbered pile. */
  pressPile(target: number): void {
    if (!this.state) return;
    moveToPile(this.state, this.cursor, target);
    this.redraw();
  }

  private redraw(): void {
    const state = this.state;
    if (!state) return;

    const g = this.graphics;
    g.clear();
    drawBevel(g, 0, 0, BOARD.w, BOARD.h);
    g.fillStyle(PALETTE.win95Title, 1);
    g.fillRect(3, 3, BOARD.w - 6, WIN95.titleBarH - 2);

    // The felt.
    g.fillStyle(0x1f6b3a, 1);
    g.fillRect(8, WIN95.titleBarH + 6 + BOARD.reflectionH, BOARD.w - 16, BOARD.h - WIN95.titleBarH - 46);

    for (const label of this.labels) label.destroy();
    this.labels.length = 0;

    const ranks = NPC_TEXT.fluff.cards.ranks;
    const suits = NPC_TEXT.fluff.cards.suits;

    const drawCard = (cx: number, cy: number, card: { rank: number; suit: number; faceUp: boolean }): void => {
      if (!card.faceUp) {
        drawBevel(g, cx, cy, BOARD.cardW, BOARD.cardH, { face: 0x4a5a8a });
        return;
      }
      drawBevel(g, cx, cy, BOARD.cardW, BOARD.cardH, { face: PALETTE.paper });
      const text = this.scene.add
        .text(cx + 4, cy + 3, `${ranks[card.rank - 1] ?? card.rank}${suits[card.suit] ?? ''}`, {
          ...UI_FONT,
          color: isRed(card.suit as 0 | 1 | 2 | 3) ? '#a01f1f' : '#101010',
        })
        .setResolution(1);
      this.labels.push(text);
      this.container.add(text);
    };

    // Stock and waste, top-left.
    const stockX = 16;
    const stockY = WIN95.titleBarH + 6 + BOARD.reflectionH + 6;
    if (state.stock.length > 0) drawBevel(g, stockX, stockY, BOARD.cardW, BOARD.cardH, { face: 0x4a5a8a });
    else drawBevel(g, stockX, stockY, BOARD.cardW, BOARD.cardH, { style: 'in', face: 0x1a5a30 });

    const wasteTop = topOf(state.waste);
    if (wasteTop) drawCard(stockX + BOARD.cardW + 8, stockY, wasteTop);

    // Foundations, top-right: one slot per suit.
    state.foundations.forEach((rank, suit) => {
      const fx = BOARD.w - 16 - (state.foundations.length - suit) * (BOARD.cardW + 6);
      if (rank === 0) {
        drawBevel(g, fx, stockY, BOARD.cardW, BOARD.cardH, { style: 'in', face: 0x1a5a30 });
      } else {
        drawCard(fx, stockY, { rank, suit, faceUp: true });
      }
    });

    // The tableau.
    state.piles.forEach((pile, index) => {
      const px = 16 + index * (BOARD.cardW + BOARD.gap);
      const py = BOARD.pileTop + 22;
      if (pile.length === 0) drawBevel(g, px, py, BOARD.cardW, BOARD.cardH, { style: 'in', face: 0x1a5a30 });
      pile.forEach((card, depth) => drawCard(px, py + depth * BOARD.stagger, card));

      // The selection marker, and the pile's number for moving onto it.
      const marker = this.scene.add
        .text(px + BOARD.cardW / 2, py - 14, `${index + 1}`, {
          ...UI_FONT,
          color: this.cursor === index ? '#ffffff' : css(PALETTE.win95Shadow),
        })
        .setOrigin(0.5, 0)
        .setResolution(1);
      this.labels.push(marker);
      this.container.add(marker);
      if (this.cursor === index) {
        g.lineStyle(2, 0xffffff, 1);
        g.strokeRect(px - 2, py - 2, BOARD.cardW + 4, BOARD.cardH + 4);
      }
    });

    if (this.cursor === -1 && wasteTop) {
      g.lineStyle(2, 0xffffff, 1);
      g.strokeRect(stockX + BOARD.cardW + 6, stockY - 2, BOARD.cardW + 4, BOARD.cardH + 4);
    }

    const status = state.won
      ? NPC_TEXT.fluff.cards.won
      : hasAnyMove(state)
        ? NPC_TEXT.fluff.cards.hint
        : NPC_TEXT.fluff.cards.stuck;
    if (this.statusText.text !== status) this.statusText.setText(status);
  }
}
