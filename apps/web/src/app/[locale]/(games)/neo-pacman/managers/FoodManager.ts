import { GAME_CONFIG } from '../config';
import { Food } from '../entities/Food';
import type { TilePosition } from '../types';
import { FoodType } from '../types';
import type { MapManager } from './MapManager';
import * as Phaser from 'phaser';

export class FoodManager {
  private scene: Phaser.Scene;
  private mapManager: MapManager;
  private foodItems: Food[] = [];
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

    const food = new Food(this.scene, tile, foodType, this.mapManager);

    this.foodItems.push(food);
    this.occupiedTiles.add(tileKey);
  }

  /**
   * Remove a food item
   */
  removeFood(tile: TilePosition): Food | null {
    const index = this.foodItems.findIndex((food) => food.isAtPosition(tile));

    if (index === -1) return null;

    const food = this.foodItems[index];
    if (food) {
      food.destroy();
      this.foodItems.splice(index, 1);

      const tileKey = `${tile.row},${tile.col}`;
      this.occupiedTiles.delete(tileKey);

      return food;
    }

    return null;
  }

  /**
   * Get food at a specific tile
   */
  getFoodAt(tile: TilePosition): Food | null {
    return this.foodItems.find((food) => food.isAtPosition(tile)) || null;
  }

  /**
   * Get all food items
   */
  getAllFood(): Food[] {
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
    this.foodItems.forEach((food) => food.destroy());
    this.foodItems = [];
    this.occupiedTiles.clear();
  }
}
