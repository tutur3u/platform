import type { Food } from '../entities/Food';
import type { Ghost } from '../entities/Ghost';
import type { Pacman } from '../entities/Pacman';

export class CollisionManager {
  constructor() {}

  /**
   * Check collision between Pacman and food
   */
  checkPacmanFoodCollision(
    pacman: Pacman,
    foods: Food[]
  ): {
    foodsEaten: Food[];
    points: number;
  } {
    const foodsEaten: Food[] = [];
    let points = 0;

    const pacmanTile = pacman.getTilePosition();
    for (const food of foods) {
      if (food.isAtPosition(pacmanTile)) {
        foodsEaten.push(food);
        points += food.points;
      }
    }

    return { foodsEaten, points };
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

    const pacmanTile = pacman.getTilePosition();
    for (const ghost of ghosts) {
      const ghostTile = ghost.getTilePosition();
      if (
        pacmanTile.row === ghostTile.row &&
        pacmanTile.col === ghostTile.col
      ) {
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
