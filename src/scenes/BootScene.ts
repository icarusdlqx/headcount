import Phaser from 'phaser';
import { createCharacter, createTileset } from '../art/placeholder';

/**
 * Boot. There are no files to load in M1 — all art is generated — so this scene
 * exists to build the textures once and hand off. When real assets land in M9,
 * this is where the loader goes, with the same handoff.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    createTileset(this);
    createCharacter(this);

    // Nothing left for the HTML shell to say.
    document.getElementById('boot-note')?.remove();

    this.scene.start('Office');
  }
}
