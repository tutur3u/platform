import { GAME_CONFIG } from '../config';
import type { MapManager } from '../managers/MapManager';
import { Direction, type TilePosition } from '../types';
import { pixelToTile, tileToPixelCentered } from '../utils/constants';
import * as Phaser from 'phaser';

export class Pacman {
  private scene: Phaser.Scene;
  private mapManager: MapManager;
  public sprite: Phaser.GameObjects.Arc;
  public body: Phaser.Physics.Arcade.Body;
  private direction: Direction = Direction.LEFT;
  private nextDirection: Direction = Direction.LEFT;
  private speed: number = GAME_CONFIG.PACMAN_SPEED;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  public alive: boolean = true;
  private mapOffset: { x: number; y: number };
  private moveTimer: number = 0; // Frames until next move

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    mapManager: MapManager
  ) {
    this.scene = scene;
    this.mapManager = mapManager;

    // Get map offset for proper positioning
    this.mapOffset = mapManager.getMapOffset();

    // Create Pacman as a yellow circle
    this.sprite = scene.add.circle(
      x,
      y,
      GAME_CONFIG.TILE_SIZE / 2 - 2,
      0xffff00
    );

    // Enable physics on Pacman
    scene.physics.add.existing(this.sprite);
    this.body = this.sprite.body as Phaser.Physics.Arcade.Body;
    this.body.setCollideWorldBounds(true);
    this.body.setCircle(GAME_CONFIG.TILE_SIZE / 2 - 2);

    // Setup keyboard input
    this.cursors = scene.input.keyboard!.createCursorKeys();
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
   * Update sprite rotation based on direction
   */
  private updateRotation(): void {
    switch (this.direction) {
      case Direction.RIGHT:
        this.sprite.setRotation(0);
        break;
      case Direction.DOWN:
        this.sprite.setRotation(Math.PI / 2);
        break;
      case Direction.LEFT:
        this.sprite.setRotation(Math.PI);
        break;
      case Direction.UP:
        this.sprite.setRotation(-Math.PI / 2);
        break;
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
    return { x: this.sprite.x, y: this.sprite.y };
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
      scale: { from: 1, to: 0 },
      alpha: { from: 1, to: 0 },
      duration: 500,
      ease: 'Power2',
    });
  }

  /**
   * Reset Pacman to a position
   */
  reset(x: number, y: number): void {
    this.sprite.setPosition(x, y);
    this.sprite.setScale(1);
    this.sprite.setAlpha(1);
    this.direction = Direction.LEFT;
    this.alive = true;
  }

  /**
   * Clean up
   */
  destroy(): void {
    this.sprite.destroy();
  }
}
