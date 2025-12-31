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
   * Spawn initial food on the map using positions from map data
   */
  spawnInitialFood(): void {
    const entities = this.mapManager.getMapEntities();
    if (!entities) {
      console.warn('No map entities found, cannot spawn food');
      return;
    }

    // Spawn power pellets at defined positions
    for (const tile of entities.powerPelletPositions) {
      this.createFoodItem(FoodType.POWER_PELLET, tile);
    }

    // Spawn regular food at defined positions
    for (const tile of entities.foodPositions) {
      this.createFoodItem(FoodType.PELLET, tile);
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

    const food = new Food(this.scene, this.mapManager, foodType, tile);

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
   * Spawn fruits based on defined rates in tiles with no food
   */
  spawnFruits(): void {
    const navigableTiles = this.mapManager.getNavigableTiles();

    // Filter tiles that have no food
    const emptyTiles = navigableTiles.filter((tile) => {
      const tileKey = `${tile.row},${tile.col}`;
      return !this.occupiedTiles.has(tileKey);
    });

    if (emptyTiles.length === 0) {
      return; // No empty tiles available
    }

    // Try to spawn apple
    if (Math.random() < GAME_CONFIG.APPLE_SPAWN_RATE) {
      const randomIndex = Math.floor(Math.random() * emptyTiles.length);
      const tile = emptyTiles[randomIndex];
      if (tile) {
        this.createFoodItem(FoodType.APPLE, tile);
        // Remove tile from available list for next spawn
        emptyTiles.splice(randomIndex, 1);
      }
    }

    // Try to spawn strawberry (only if there are still empty tiles)
    if (
      emptyTiles.length > 0 &&
      Math.random() < GAME_CONFIG.STRAWBERRY_SPAWN_RATE
    ) {
      const randomIndex = Math.floor(Math.random() * emptyTiles.length);
      const tile = emptyTiles[randomIndex];
      if (tile) {
        this.createFoodItem(FoodType.STRAWBERRY, tile);
      }
    }
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
