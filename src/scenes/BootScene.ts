import Phaser from 'phaser';
import { createCharacter, createTileset } from '../art/placeholder';
import { assertClockBalance } from '../sim/DayClock';
import { DayDirector, installDirector } from '../sim/DayDirector';
import { SaveService } from '../save/SaveService';
import { assertContentIntegrity } from '../ui/daySummaryView';

/**
 * Boot. There are no files to load — all art is generated — so this scene builds
 * the textures, loads the save, constructs the DayDirector and hands off.
 *
 * The save is read HERE, before any scene depends on the result: a corrupt save
 * that throws inside a running scene is a black canvas with no reset UI, which is
 * effectively a bricked browser profile for that player.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    assertClockBalance();

    createTileset(this);
    createCharacter(this);

    if (import.meta.env.DEV) {
      const problems = assertContentIntegrity();
      for (const problem of problems) console.warn(`[content] ${problem}`);
    }

    const save = SaveService.boot(Date.now());
    const director = new DayDirector(save.state, save);
    installDirector(this.game, director);

    // Held until OfficeScene finishes create(). Nothing may burn the workday
    // before the office is actually on screen — the same pattern M9's title
    // screen will use.
    director.hold('boot');

    // Nothing left for the HTML shell to say.
    document.getElementById('boot-note')?.remove();

    this.scene.start('Office');
  }
}
