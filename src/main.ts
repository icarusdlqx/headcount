import Phaser from 'phaser';
import { BALANCE } from './config/balance';
import { PALETTE } from './art/palette';
import { BootScene } from './scenes/BootScene';
import { OfficeScene } from './scenes/OfficeScene';

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
  scene: [BootScene, OfficeScene],
};

const game = new Phaser.Game(config);

// Dev-only handle so the console (and automated checks) can poke at the running
// game. Stripped from production builds by Vite's constant folding.
if (import.meta.env.DEV) {
  (globalThis as unknown as { game: Phaser.Game }).game = game;
}
