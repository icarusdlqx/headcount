import Phaser from 'phaser';
import { BALANCE } from '../config/balance';
import { CHAR_DIRECTIONS, CHAR_FRAME_H, CHAR_FRAME_W } from '../art/charFrames';
import type { NpcPose } from '../sim/npcSchedule';
import type { ActorId } from '../sim/npcRoster';

/**
 * One person on the floor.
 *
 * People are SOLID. An earlier version gave them no body at all, on the grounds
 * that four pushable bodies in a two-tile doorway is a soft-lock waiting to
 * happen — but walking through a colleague reads as broken, and it is. The fix
 * is not "no body", it is an IMMOVABLE one:
 *
 *   - Immovable and non-pushable, so the separation pass only ever moves the
 *     player. An NPC can never shove the player into a wall.
 *   - A feet-box the same size as the player's, so a parked person occupies part
 *     of one tile. Every corridor here is two tiles wide and every doorway two
 *     tiles tall, so one person can never seal a route.
 *   - No NPC-to-NPC and no NPC-to-tilemap collider. They are path-driven and
 *     provably never enter a wall (see npc.test.ts), so those colliders would
 *     cost work every frame to prevent nothing.
 *
 * Animation keys are namespaced per texture, because Phaser's animation manager
 * is GLOBAL: a second character registering 'walk-down' would silently rebind
 * the player's own animation to somebody else's sheet.
 */
export class Npc extends Phaser.Physics.Arcade.Sprite {
  readonly actorId: ActorId;
  private lastFacing = '';
  private lastMoving = false;

  constructor(scene: Phaser.Scene, actorId: ActorId, textureKey: string) {
    super(scene, 0, 0, textureKey, 0);
    this.actorId = actorId;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 0.5);
    this.setVisible(false);

    const body = this.body as Phaser.Physics.Arcade.Body;
    const { bodyWidth, bodyHeight } = BALANCE.player;
    body.setSize(bodyWidth, bodyHeight);
    body.setOffset((CHAR_FRAME_W - bodyWidth) / 2, CHAR_FRAME_H - bodyHeight - 1);
    // The whole safety argument: the player gets displaced, never the NPC.
    body.setImmovable(true);
    body.pushable = false;
    body.moves = false;

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
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (!pose.visible) {
      if (this.visible) {
        this.setVisible(false);
        // Off the floor must mean out of the way too, or Steve's lunch leaves an
        // invisible wall standing in his cubicle all afternoon.
        body.enable = false;
      }
      return;
    }
    if (!body.enable) body.enable = true;

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
