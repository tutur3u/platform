import { GAME_CONFIG } from '../config';
import { MapManager } from '../managers/MapManager';
import { FoodType, type TilePosition } from '../types';
import { tileToPixelCentered } from '../utils/helpers';
import * as Phaser from 'phaser';

export class Food {
  private scene: Phaser.Scene;
  private mapManager: MapManager;
  public position: TilePosition;
  public type: FoodType;
  public points: number;
  public sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Arc;

  constructor(
    scene: Phaser.Scene,
    mapManager: MapManager,
    type: FoodType,
    position: TilePosition
  ) {
    this.scene = scene;
    this.mapManager = mapManager;
    this.type = type;
    this.position = position;

    // Calculate screen position
    const pos = tileToPixelCentered(position.row, position.col);
    const mapOffset = this.mapManager.getMapOffset();
    const adjustedX = pos.x + mapOffset.x;
    const adjustedY = pos.y + mapOffset.y;

    // Create sprite and set points based on food type
    switch (type) {
      case FoodType.POWER_PELLET:
        this.points = GAME_CONFIG.POWER_PELLET_POINTS;
        this.sprite = scene.add.circle(adjustedX, adjustedY, 8, 0xffffff);
        this.scene.tweens.add({
          targets: this.sprite,
          scale: { from: 1, to: 1.3 },
          duration: 500,
          yoyo: true,
          repeat: -1,
        });
        break;

      case FoodType.APPLE:
        this.points = GAME_CONFIG.APPLE_POINTS;
        this.sprite = scene.add.image(adjustedX, adjustedY, 'apple');
        this.sprite.setDisplaySize(16, 16);
        break;

      case FoodType.STRAWBERRY:
        this.points = GAME_CONFIG.STRAWBERRY_POINTS;
        this.sprite = scene.add.image(adjustedX, adjustedY, 'strawberry');
        this.sprite.setDisplaySize(16, 16);
        break;

      case FoodType.PELLET:
      default:
        this.points = GAME_CONFIG.PELLET_POINTS;
        this.sprite = scene.add.image(adjustedX, adjustedY, 'dot');
        this.sprite.setDisplaySize(32, 32);
        break;
    }

    // Set depth to ensure food renders below entities
    this.sprite.setDepth(1);
  }

  /**
   * Check if this food is at the specified position
   */
  isAtPosition(position: TilePosition): boolean {
    return (
      this.position.row === position.row && this.position.col === position.col
    );
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.sprite.destroy();
  }
}
