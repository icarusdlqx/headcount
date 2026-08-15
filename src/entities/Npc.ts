import Phaser from 'phaser';
import { BALANCE } from '../config/balance';
import { CHAR_DIRECTIONS } from '../art/charFrames';
import type { NpcPose } from '../sim/npcSchedule';
import type { ActorId } from '../sim/npcRoster';

/**
 * One person on the floor.
 *
 * DELIBERATELY NO PHYSICS BODY. A path-driven sprite that overwrites its own
 * velocity fights Arcade's separation pass every frame, and four pushable bodies
 * in a two-tile doorway is a soft-lock waiting to happen — the player could be
 * shoved into a wall, or walled out of the fax room by Marjorie's cart. NPCs are
 * drawn where the schedule says they are; the player walks through them, which
 * at this scale reads as passing rather than as a bug.
 *
 * Animation keys are namespaced per texture, because Phaser's animation manager
 * is GLOBAL: a second character registering 'walk-down' would silently rebind
 * the player's own animation to somebody else's sheet.
 */
export class Npc extends Phaser.GameObjects.Sprite {
  readonly actorId: ActorId;
  private lastFacing = '';
  private lastMoving = false;

  constructor(scene: Phaser.Scene, actorId: ActorId, textureKey: string) {
    super(scene, 0, 0, textureKey, 0);
    this.actorId = actorId;
    scene.add.existing(this);
    this.setOrigin(0.5, 0.5);
    this.setVisible(false);
    this.createAnimations(textureKey);
  }

  private createAnimations(textureKey: string): void {
    const { anims } = this.scene;
    CHAR_DIRECTIONS.forEach((dir, row) => {
      const base = row * 3;
      const idleKey = `${textureKey}-idle-${dir}`;
      const walkKey = `${textureKey}-walk-${dir}`;

      if (!anims.exists(idleKey)) {
        anims.create({ key: idleKey, frames: [{ key: textureKey, frame: base }], frameRate: 1 });
      }
      if (!anims.exists(walkKey)) {
        anims.create({
          key: walkKey,
          frames: [base + 1, base, base + 2, base].map((frame) => ({ key: textureKey, frame })),
          frameRate: BALANCE.player.walkFrameRate,
          repeat: -1,
        });
      }
    });
  }

  /**
   * Place this sprite at the pose the clock says. Called once per frame from
   * OfficeScene; the animation is diff-guarded because play() on an already
   * playing key still costs more than two string compares.
   */
  syncTo(pose: Readonly<NpcPose>): void {
    if (!pose.visible) {
      if (this.visible) this.setVisible(false);
      return;
    }

    const size = BALANCE.view.tileSize;
    this.setVisible(true);
    // Feet on the tile the schedule names, matching how the player's own body
    // is anchored, so a person standing "at the fax" lines up with the machine.
    this.setPosition(pose.x * size + size / 2, pose.y * size + size / 2);
    // Depth by Y so someone further down the office draws in front.
    this.setDepth(pose.y);

    if (pose.facing !== this.lastFacing || pose.moving !== this.lastMoving) {
      this.lastFacing = pose.facing;
      this.lastMoving = pose.moving;
      this.anims.play(`${this.texture.key}-${pose.moving ? 'walk' : 'idle'}-${pose.facing}`, true);
    }
  }
}
