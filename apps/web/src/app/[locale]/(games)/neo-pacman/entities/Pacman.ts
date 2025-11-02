import { GAME_CONFIG } from '../config';
import type { MapManager } from '../managers/MapManager';
import { Direction, type TilePosition } from '../types';
import { pixelToTile, tileToPixelCentered } from '../utils/helpers';
import * as Phaser from 'phaser';

export class Pacman {
  private scene: Phaser.Scene;
  private mapManager: MapManager;
  public sprite: Phaser.GameObjects.Sprite;
  public body: Phaser.Physics.Arcade.Body;
  public homePosition: TilePosition;
  public direction: Direction = Direction.LEFT;
  public nextDirection: Direction = Direction.LEFT;
  private speed: number = GAME_CONFIG.PACMAN_SPEED;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  public alive: boolean = true;
  private mapOffset: { x: number; y: number };
  private moveTimer: number = 0; // Frames until next move

  constructor(
    scene: Phaser.Scene,
    mapManager: MapManager,
    position: TilePosition
  ) {
    this.scene = scene;
    this.mapManager = mapManager;
    this.homePosition = position;

    // Get map offset for proper positioning
    this.mapOffset = mapManager.getMapOffset();

    // Create Pacman animations for each direction
    this.createAnimations();

    // Create Pacman as a sprite
    const pos = tileToPixelCentered(position.row, position.col);
    this.sprite = scene.add.sprite(
      pos.x + this.mapOffset.x,
      pos.y + this.mapOffset.y,
      'pacman-left-1'
    );
    this.sprite.setDisplaySize(
      GAME_CONFIG.TILE_SIZE - 4,
      GAME_CONFIG.TILE_SIZE - 4
    );
    this.sprite.setDepth(10); // Ensure Pacman renders above food

    // Enable physics on Pacman
    scene.physics.add.existing(this.sprite);
    this.body = this.sprite.body as Phaser.Physics.Arcade.Body;
    this.body.setCircle(GAME_CONFIG.TILE_SIZE / 2 - 2);

    // Start with left animation
    this.sprite.play('pacman-left');

    // Setup keyboard input
    this.cursors = scene.input.keyboard!.createCursorKeys();
  }

  /**
   * Create animations for each direction
   */
  private createAnimations(): void {
    const directions = ['up', 'down', 'left', 'right'];

    directions.forEach((direction) => {
      // Check if animation already exists
      if (this.scene.anims.exists(`pacman-${direction}`)) {
        return;
      }

      this.scene.anims.create({
        key: `pacman-${direction}`,
        frames: [
          { key: `pacman-${direction}-1` },
          { key: `pacman-${direction}-2` },
          { key: `pacman-${direction}-3` },
        ],
        frameRate: 10,
        repeat: -1,
      });
    });
  }

  /**
   * Update Pacman's position and direction
   */
  update(): void {
    if (!this.alive) return;

    // Handle input
    this.handleInput();

    // Move in current direction
    this.move();

    // Update sprite rotation based on direction
    this.updateRotation();
  }

  /**
   * Handle keyboard input - queue direction changes
   */
  private handleInput(): void {
    // Queue direction changes - will be applied when possible
    if (this.cursors.left?.isDown) {
      this.nextDirection = Direction.LEFT;
    } else if (this.cursors.right?.isDown) {
      this.nextDirection = Direction.RIGHT;
    } else if (this.cursors.up?.isDown) {
      this.nextDirection = Direction.UP;
    } else if (this.cursors.down?.isDown) {
      this.nextDirection = Direction.DOWN;
    }
  }

  /**
   * Move Pacman in current direction using grid-based movement
   */
  private move(): void {
    if (this.nextDirection === Direction.NONE) {
      return;
    }

    // Decrement move timer
    this.moveTimer--;

    // Only move when timer reaches 0
    if (this.moveTimer > 0) {
      return;
    }

    // Reset timer for next move
    this.moveTimer = this.speed;

    // Get current tile position
    const currentTile = this.getTilePosition();
    const nextTile = this.getNextTile(currentTile, this.nextDirection);

    if (nextTile && !this.mapManager.isWall(nextTile.row, nextTile.col)) {
      // Move to next tile center
      const nextPos = tileToPixelCentered(nextTile.row, nextTile.col);
      this.sprite.setPosition(
        nextPos.x + this.mapOffset.x,
        nextPos.y + this.mapOffset.y
      );
      // Successfully moved, update direction
      this.direction = this.nextDirection;
    } else {
      // Can't move in nextDirection (wall or out of bounds)
      // If trying to turn (nextDirection != direction), keep going in current direction
      if (this.nextDirection !== this.direction) {
        // Try to continue in current direction
        const currentDirectionTile = this.getNextTile(
          currentTile,
          this.direction
        );
        if (
          currentDirectionTile &&
          !this.mapManager.isWall(
            currentDirectionTile.row,
            currentDirectionTile.col
          )
        ) {
          // Can continue in current direction
          const nextPos = tileToPixelCentered(
            currentDirectionTile.row,
            currentDirectionTile.col
          );
          this.sprite.setPosition(
            nextPos.x + this.mapOffset.x,
            nextPos.y + this.mapOffset.y
          );
        } else {
          // Can't continue in current direction either, stop
          this.direction = Direction.NONE;
          this.nextDirection = Direction.NONE;
        }
      } else {
        // Moving straight ahead but hit a wall, stop
        this.direction = Direction.NONE;
      }
    }
  }

  /**
   * Get the next tile in a given direction
   */
  private getNextTile(
    currentTile: TilePosition,
    direction: Direction
  ): TilePosition | null {
    switch (direction) {
      case Direction.LEFT:
        return { row: currentTile.row, col: currentTile.col - 1 };
      case Direction.RIGHT:
        return { row: currentTile.row, col: currentTile.col + 1 };
      case Direction.UP:
        return { row: currentTile.row - 1, col: currentTile.col };
      case Direction.DOWN:
        return { row: currentTile.row + 1, col: currentTile.col };
      default:
        return null;
    }
  }

  /**
   * Update sprite animation based on direction
   */
  private updateRotation(): void {
    let animKey: string;
    switch (this.direction) {
      case Direction.RIGHT:
        animKey = 'pacman-right';
        break;
      case Direction.DOWN:
        animKey = 'pacman-down';
        break;
      case Direction.LEFT:
        animKey = 'pacman-left';
        break;
      case Direction.UP:
        animKey = 'pacman-up';
        break;
      default:
        return;
    }

    // Only change animation if it's different from current
    if (this.sprite.anims.currentAnim?.key !== animKey) {
      this.sprite.play(animKey);
    }
  }

  /**
   * Get current tile position
   */
  getTilePosition() {
    // Convert from screen space to map space before getting tile position
    return pixelToTile(
      this.sprite.x - this.mapOffset.x,
      this.sprite.y - this.mapOffset.y
    );
  }

  /**
   * Get pixel position
   */
  getPosition() {
    return {
      x: this.sprite.x - this.mapOffset.x,
      y: this.sprite.y - this.mapOffset.y,
    };
  }

  /**
   * Die animation
   */
  die(): void {
    this.alive = false;
    this.direction = Direction.NONE;

    // Death animation
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: { from: 1, to: 0 },
      duration: 500,
      ease: 'Power2',
    });
  }

  /**
   * Reset Pacman to a position
   */
  reset(position?: TilePosition): void {
    if (position) {
      this.homePosition = position;
    }
    const pos = tileToPixelCentered(
      this.homePosition.row,
      this.homePosition.col
    );
    this.sprite.setPosition(pos.x + this.mapOffset.x, pos.y + this.mapOffset.y);
    this.sprite.setAlpha(1);
    this.direction = Direction.LEFT;
    this.alive = true;
    this.sprite.play('pacman-left');
  }

  /**
   * Clean up
   */
  destroy(): void {
    this.sprite.destroy();
  }
}
