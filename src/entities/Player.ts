import Phaser from 'phaser';
import { BALANCE } from '../config/balance';
import { CHAR_DIRECTIONS, CHAR_FRAME_H, CHAR_FRAME_W, PLAYER_KEY, type CharDirection } from '../art/placeholder';

/**
 * The player character: an employee of unremarkable standing.
 *
 * Movement is 8-directional and normalised so diagonals are not a speed exploit.
 * The physics body is a feet-box so the sprite's head can overlap furniture
 * without snagging on corners.
 */
export class Player extends Phaser.Physics.Arcade.Sprite {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'up' | 'down' | 'left' | 'right' | 'purpose', Phaser.Input.Keyboard.Key>;
  private facingDir: CharDirection = 'down';

  /** Reused every frame so movement allocates nothing in the hot loop. */
  private readonly move = new Phaser.Math.Vector2();

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, PLAYER_KEY, 0);

    scene.add.existing(this);
    scene.physics.add.existing(this);

    const body = this.body as Phaser.Physics.Arcade.Body;
    const { bodyWidth, bodyHeight } = BALANCE.player;
    body.setSize(bodyWidth, bodyHeight);
    body.setOffset((CHAR_FRAME_W - bodyWidth) / 2, CHAR_FRAME_H - bodyHeight - 1);
    body.setCollideWorldBounds(true);

    this.setOrigin(0.5, 0.5);
    this.createAnimations();
    this.bindInput();
    this.anims.play('idle-down');
  }

  private createAnimations(): void {
    const { anims } = this.scene;
    const rate = BALANCE.player.walkFrameRate;

    CHAR_DIRECTIONS.forEach((dir, row) => {
      const base = row * 3;
      if (!anims.exists(`idle-${dir}`)) {
        anims.create({ key: `idle-${dir}`, frames: [{ key: PLAYER_KEY, frame: base }], frameRate: 1 });
      }
      if (!anims.exists(`walk-${dir}`)) {
        anims.create({
          key: `walk-${dir}`,
          frames: [base + 1, base, base + 2, base].map((frame) => ({ key: PLAYER_KEY, frame })),
          frameRate: rate,
          repeat: -1,
        });
      }
    });
  }

  private bindInput(): void {
    const keyboard = this.scene.input.keyboard;
    if (!keyboard) throw new Error('Player: no keyboard plugin; HEADCOUNT is a keyboard game');

    this.cursors = keyboard.createCursorKeys();
    this.wasd = {
      up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      purpose: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
    };
  }

  /** Current facing, for line-of-sight and interaction checks in later milestones. */
  get facing(): CharDirection {
    return this.facingDir;
  }

  /**
   * Tile the player is standing on. Measured from the feet-box, not the sprite
   * centre — the sprite is taller than a tile, so its centre reads as the tile
   * in front of the one actually being stood on.
   */
  tileCoords(out: Phaser.Math.Vector2): Phaser.Math.Vector2 {
    const size = BALANCE.view.tileSize;
    const body = this.body as Phaser.Physics.Arcade.Body;
    return out.set(Math.floor(body.center.x / size), Math.floor(body.center.y / size));
  }

  override preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);

    const left = this.cursors.left.isDown || this.wasd.left.isDown;
    const right = this.cursors.right.isDown || this.wasd.right.isDown;
    const up = this.cursors.up.isDown || this.wasd.up.isDown;
    const down = this.cursors.down.isDown || this.wasd.down.isDown;

    this.move.set((right ? 1 : 0) - (left ? 1 : 0), (down ? 1 : 0) - (up ? 1 : 0));

    const body = this.body as Phaser.Physics.Arcade.Body;

    if (this.move.x === 0 && this.move.y === 0) {
      body.setVelocity(0, 0);
      this.anims.play(`idle-${this.facingDir}`, true);
      return;
    }

    const speed = this.wasd.purpose.isDown ? BALANCE.player.purposefulSpeed : BALANCE.player.walkSpeed;
    this.move.normalize().scale(speed);
    body.setVelocity(this.move.x, this.move.y);

    // Vertical facing wins on a diagonal: it reads better against the tile grid.
    if (this.move.y !== 0 && Math.abs(this.move.y) >= Math.abs(this.move.x)) {
      this.facingDir = this.move.y > 0 ? 'down' : 'up';
    } else {
      this.facingDir = this.move.x > 0 ? 'right' : 'left';
    }

    this.anims.play(`walk-${this.facingDir}`, true);
  }
}
