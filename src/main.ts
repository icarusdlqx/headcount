import Phaser from 'phaser';
import { BALANCE } from './config/balance';
import { PALETTE } from './art/palette';
import { BootScene } from './scenes/BootScene';
import { OfficeScene } from './scenes/OfficeScene';
import { DayEndScene } from './scenes/DayEndScene';
import { FaxScene } from './scenes/FaxScene';
import { PrinterScene } from './scenes/PrinterScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  width: BALANCE.view.width,
  height: BALANCE.view.height,
  backgroundColor: PALETTE.carpet,
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  // Order matters: SceneManager.render walks this array forward, so DayEnd draws
  // above the world AND above the HUD.
  scene: [BootScene, OfficeScene, FaxScene, PrinterScene, DayEndScene],
};

const game = new Phaser.Game(config);

// Dev-only handle so the console (and automated checks) can poke at the running
// game. Stripped from production builds by Vite's constant folding.
if (import.meta.env.DEV) {
  (globalThis as unknown as { game: Phaser.Game }).game = game;
  (globalThis as unknown as { headcount: unknown }).headcount = {
    /** Start over. The only wipe affordance M2 ships — a player-facing one with
     *  a confirm dialog is M9's problem, along with the title screen it belongs on. */
    wipeSave(): string {
      const director = game.registry.get('dayDirector') as
        | { saveService: { wipe(): void } }
        | undefined;
      if (!director) return 'no director yet';
      director.saveService.wipe();
      return 'wiped — reload to start a new run';
    },
    dumpSave(): string | null {
      return globalThis.localStorage?.getItem('headcount.save.main.dev') ?? null;
    },
  };
}
