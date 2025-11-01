import { GAME_CONFIG } from '../config';
import type { FoodItem, TilePosition } from '../types';
import { FoodType } from '../types';
import { tileToPixelCentered } from '../utils/constants';
import type { MapManager } from './MapManager';
import * as Phaser from 'phaser';

export class FoodManager {
  private scene: Phaser.Scene;
  private mapManager: MapManager;
  private foodItems: FoodItem[] = [];
  private occupiedTiles: Set<string> = new Set();

  constructor(scene: Phaser.Scene, mapManager: MapManager) {
    this.scene = scene;
    this.mapManager = mapManager;
  }

  /**
   * Spawn initial food on the map
   */
  spawnInitialFood(): void {
    const navigableTiles = this.mapManager.getNavigableTiles();

    for (const tile of navigableTiles) {
      const random = Math.random();

      let foodType: FoodType;
      if (random < GAME_CONFIG.POWER_PELLET_RATE) {
        foodType = FoodType.POWER_PELLET;
      } else if (
        random <
        GAME_CONFIG.POWER_PELLET_RATE + GAME_CONFIG.FRUIT_RATE
      ) {
        foodType = FoodType.FRUIT;
      } else if (
        random <
        GAME_CONFIG.POWER_PELLET_RATE +
          GAME_CONFIG.FRUIT_RATE +
          GAME_CONFIG.PELLET_RATE
      ) {
        foodType = FoodType.PELLET;
      } else {
        // Don't spawn food on this tile
        continue;
      }

      this.createFoodItem(foodType, tile);
    }
  }

  /**
   * Create a food item at the specified tile
   */
  private createFoodItem(foodType: FoodType, tile: TilePosition): void {
    const tileKey = `${tile.row},${tile.col}`;

    // Don't spawn if tile is already occupied
    if (this.occupiedTiles.has(tileKey)) {
      return;
    }

    const pos = tileToPixelCentered(tile.row, tile.col);
    const offset = this.mapManager.getMapOffset();
    const adjustedX = pos.x + offset.x;
    const adjustedY = pos.y + offset.y;
    let sprite: Phaser.GameObjects.GameObject;
    let points: number;

    switch (foodType) {
      case FoodType.PELLET:
        points = GAME_CONFIG.PELLET_POINTS;
        sprite = this.scene.add.image(adjustedX, adjustedY, 'dot');
        (sprite as Phaser.GameObjects.Image).setDisplaySize(8, 8);
        break;

      case FoodType.POWER_PELLET:
        points = GAME_CONFIG.POWER_PELLET_POINTS;
        sprite = this.scene.add.image(adjustedX, adjustedY, 'dot');
        (sprite as Phaser.GameObjects.Image).setDisplaySize(16, 16);
        // Add pulsing animation
        this.scene.tweens.add({
          targets: sprite,
          scale: { from: 1, to: 1.3 },
          duration: 500,
          yoyo: true,
          repeat: -1,
        });
        break;

      case FoodType.FRUIT:
        points = GAME_CONFIG.FRUIT_POINTS;
        // Use apple image for fruits
        sprite = this.scene.add.image(adjustedX, adjustedY, 'apple');
        (sprite as Phaser.GameObjects.Image).setDisplaySize(16, 16);
        break;

      default:
        // Fallback to pellet
        points = GAME_CONFIG.PELLET_POINTS;
        sprite = this.scene.add.image(adjustedX, adjustedY, 'dot');
        (sprite as Phaser.GameObjects.Image).setDisplaySize(8, 8);
        break;
    }

    const foodItem: FoodItem = {
      type: foodType,
      position: tile,
      points,
      sprite,
    };

    this.foodItems.push(foodItem);
    this.occupiedTiles.add(tileKey);
  }

  /**
   * Remove a food item
   */
  removeFood(tile: TilePosition): FoodItem | null {
    const index = this.foodItems.findIndex(
      (food) => food.position.row === tile.row && food.position.col === tile.col
    );

    if (index === -1) return null;

    const food = this.foodItems[index];
    food?.sprite?.destroy();
    this.foodItems.splice(index, 1);

    const tileKey = `${tile.row},${tile.col}`;
    this.occupiedTiles.delete(tileKey);

    return food || null;
  }

  /**
   * Get food at a specific tile
   */
  getFoodAt(tile: TilePosition): FoodItem | null {
    return (
      this.foodItems.find(
        (food) =>
          food.position.row === tile.row && food.position.col === tile.col
      ) || null
    );
  }

  /**
   * Get all food items
   */
  getAllFood(): FoodItem[] {
    return this.foodItems;
  }

  /**
   * Get food count
   */
  getFoodCount(): number {
    return this.foodItems.length;
  }

  /**
   * Check if there's any food left
   */
  hasFood(): boolean {
    return this.foodItems.length > 0;
  }

  /**
   * Clean up
   */
  destroy(): void {
    this.foodItems.forEach((food) => food.sprite?.destroy());
    this.foodItems = [];
    this.occupiedTiles.clear();
  }
}
