import { GAME_CONFIG } from '../config';
import type { MapManager } from '../managers/MapManager';
import { Direction } from '../types';
import { pixelToTile } from '../utils/constants';
import * as Phaser from 'phaser';

export class Pacman {
  private scene: Phaser.Scene;
  private mapManager: MapManager;
  public sprite: Phaser.GameObjects.Arc;
  private direction: Direction = Direction.LEFT;
  private speed: number = GAME_CONFIG.PACMAN_SPEED;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  public alive: boolean = true;
  private mapOffset: { x: number; y: number };

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
   * Handle keyboard input
   */
  private handleInput(): void {
    // Update direction only when a key is pressed
    // Pacman continues moving in the current direction until a new key is pressed or hits a wall
    if (this.cursors.left?.isDown) {
      this.direction = Direction.LEFT;
    } else if (this.cursors.right?.isDown) {
      this.direction = Direction.RIGHT;
    } else if (this.cursors.up?.isDown) {
      this.direction = Direction.UP;
    } else if (this.cursors.down?.isDown) {
      this.direction = Direction.DOWN;
    }
    // No else clause - Pacman keeps moving in current direction
  }

  /**
   * Get next X position based on direction
   */
  private getNextX(dir: Direction): number {
    switch (dir) {
      case Direction.LEFT:
        return this.sprite.x - this.speed;
      case Direction.RIGHT:
        return this.sprite.x + this.speed;
      default:
        return this.sprite.x;
    }
  }

  /**
   * Get next Y position based on direction
   */
  private getNextY(dir: Direction): number {
    switch (dir) {
      case Direction.UP:
        return this.sprite.y - this.speed;
      case Direction.DOWN:
        return this.sprite.y + this.speed;
      default:
        return this.sprite.y;
    }
  }

  /**
   * Move Pacman in current direction
   */
  private move(): void {
    if (this.direction === Direction.NONE) return;

    const nextX = this.getNextX(this.direction);
    const nextY = this.getNextY(this.direction);

    // Check if next position is valid
    if (!this.mapManager.isWallAtPixel(nextX, nextY)) {
      this.sprite.setPosition(nextX, nextY);
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
