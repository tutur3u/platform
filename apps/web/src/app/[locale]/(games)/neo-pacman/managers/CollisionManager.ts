import type { Ghost } from '../entities/Ghost';
import type { Pacman } from '../entities/Pacman';
import { FoodType } from '../types';
import type { FoodManager } from './FoodManager';
import * as Phaser from 'phaser';

export class CollisionManager {
  private scene: Phaser.Scene;
  private foodManager: FoodManager;

  constructor(scene: Phaser.Scene, foodManager: FoodManager) {
    this.scene = scene;
    this.foodManager = foodManager;
  }

  /**
   * Check collision between Pacman and food
   */
  checkPacmanFoodCollision(pacman: Pacman): {
    points: number;
    powerPelletEaten: boolean;
  } {
    let totalPoints = 0;
    let powerPelletEaten = false;

    const pacmanTile = pacman.getTilePosition();
    const food = this.foodManager.getFoodAt(pacmanTile);

    if (food) {
      totalPoints = food.points;

      if (food.type === FoodType.POWER_PELLET) {
        powerPelletEaten = true;
      }

      // Remove the food
      this.foodManager.removeFood(pacmanTile);
    }

    return { points: totalPoints, powerPelletEaten };
  }

  /**
   * Check collision between Pacman and ghosts
   */
  checkPacmanGhostCollision(
    pacman: Pacman,
    ghosts: Ghost[]
  ): {
    pacmanEaten: boolean;
    ghostsEaten: Ghost[];
    points: number;
  } {
    let pacmanEaten = false;
    const ghostsEaten: Ghost[] = [];
    let points = 0;

    if (!pacman.alive) {
      return { pacmanEaten: false, ghostsEaten: [], points: 0 };
    }

    for (const ghost of ghosts) {
      // Use physics overlap check for more accurate collision
      if (this.scene.physics.overlap(pacman.sprite, ghost.sprite)) {
        if (ghost.canBeEaten()) {
          // Pacman eats ghost
          ghost.getEaten();
          ghostsEaten.push(ghost);
          points += 200; // GHOST_POINTS
        } else if (ghost.isDangerous()) {
          // Ghost eats Pacman
          pacmanEaten = true;
        }
      }
    }

    return { pacmanEaten, ghostsEaten, points };
  }
}
