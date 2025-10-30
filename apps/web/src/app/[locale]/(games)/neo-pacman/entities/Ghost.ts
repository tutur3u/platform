import { GAME_CONFIG, GHOST_COLORS } from '../config';
import type { MapManager } from '../managers/MapManager';
import { GhostState, GhostType } from '../types';
import type { TilePosition } from '../types';
import { pixelToTile, tileToPixelCentered } from '../utils/constants';
import { findPath, getNeighbors } from '../utils/pathfinding';
import type { Pacman } from './Pacman';
import * as Phaser from 'phaser';

export class Ghost {
  private scene: Phaser.Scene;
  private mapManager: MapManager;
  public sprite: Phaser.GameObjects.Arc;
  public type: GhostType;
  public state: GhostState = GhostState.SCATTER;
  private homePosition: TilePosition;
  private speed: number = GAME_CONFIG.GHOST_SPEED;
  private stateTimer: Phaser.Time.TimerEvent | null = null;
  private mapOffset: { x: number; y: number };
  private lastDirection: TilePosition | null = null; // Track current direction
  private lastTile: TilePosition | null = null; // Track last tile position
  private frightenedTarget: TilePosition | null = null; // Target tile when frightened

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    type: GhostType,
    color: number,
    mapManager: MapManager
  ) {
    this.scene = scene;
    this.mapManager = mapManager;
    this.type = type;

    // Get map offset for proper positioning
    this.mapOffset = mapManager.getMapOffset();

    // Create ghost sprite
    this.sprite = scene.add.circle(x, y, GAME_CONFIG.TILE_SIZE / 2 - 2, color);

    // Store home position (convert from screen space to map space)
    this.homePosition = pixelToTile(x - this.mapOffset.x, y - this.mapOffset.y);

    // Start state cycling
    this.startStateCycling();
  }

  /**
   * Start cycling between CHASE and SCATTER states
   */
  private startStateCycling(): void {
    this.setState(GhostState.SCATTER);

    this.stateTimer = this.scene.time.addEvent({
      delay: GAME_CONFIG.GHOST_SCATTER_TIME,
      callback: () => {
        if (this.state === GhostState.SCATTER) {
          this.setState(GhostState.CHASE);
          this.stateTimer?.reset({
            delay: GAME_CONFIG.GHOST_CHASE_TIME,
            callback: () => this.startStateCycling(),
          });
        }
      },
    });
  }

  /**
   * Set ghost state
   */
  setState(state: GhostState): void {
    this.state = state;

    // Reset direction tracking when changing states
    if (state === GhostState.FRIGHTENED) {
      // Keep current direction when entering frightened state
      // but reset tile tracking to pick new direction immediately
      this.lastTile = null;
      this.frightenedTarget = null;
    } else {
      // Reset all tracking when exiting frightened state
      this.lastDirection = null;
      this.lastTile = null;
      this.frightenedTarget = null;
    }

    switch (state) {
      case GhostState.CHASE:
      case GhostState.SCATTER:
        this.speed = GAME_CONFIG.GHOST_SPEED;
        this.sprite.setAlpha(1);
        break;

      case GhostState.FRIGHTENED:
        this.speed = GAME_CONFIG.GHOST_FRIGHTENED_SPEED;
        this.sprite.setFillStyle(0x0000ff); // Blue when frightened
        this.sprite.setAlpha(0.7);
        break;

      case GhostState.EATEN:
        this.speed = GAME_CONFIG.GHOST_EATEN_SPEED;
        this.sprite.setAlpha(0.3);
        break;
    }
  }

  /**
   * Make ghost frightened (power pellet eaten)
   */
  makeFrightened(): void {
    if (this.state !== GhostState.EATEN) {
      this.setState(GhostState.FRIGHTENED);

      // Return to normal after duration
      this.scene.time.delayedCall(GAME_CONFIG.POWER_DURATION, () => {
        if (this.state === GhostState.FRIGHTENED) {
          this.setState(GhostState.SCATTER);
          this.resetColor();
        }
      });
    }
  }

  /**
   * Reset ghost color based on type
   */
  private resetColor(): void {
    this.sprite.setFillStyle(GHOST_COLORS[this.type]);
  }

  /**
   * Update ghost AI and movement
   */
  update(pacman: Pacman): void {
    if (this.state === GhostState.EATEN) {
      // Move back to home
      this.moveTowardsTarget(this.homePosition);

      // Check if reached home
      const currentTile = this.getTilePosition();
      if (
        currentTile.row === this.homePosition.row &&
        currentTile.col === this.homePosition.col
      ) {
        this.setState(GhostState.SCATTER);
        this.resetColor();
      }
      return;
    }

    // Determine target based on state and ghost type
    const pacmanTile = pacman.getTilePosition();
    let target: TilePosition;

    if (this.state === GhostState.FRIGHTENED) {
      // Random movement when frightened - choose direction at intersections
      const currentTile = this.getTilePosition();

      // Pick a new direction when we've entered a new tile (or don't have a target yet)
      if (
        !this.frightenedTarget ||
        !this.lastTile ||
        currentTile.row !== this.lastTile.row ||
        currentTile.col !== this.lastTile.col
      ) {
        const nextTile = this.getFrightenedDirection(currentTile);
        if (nextTile) {
          this.frightenedTarget = nextTile;
          this.lastTile = currentTile;
        } else {
          // Fallback if no valid direction found
          this.frightenedTarget = pacmanTile;
        }
      }

      // Always move towards the frightened target
      target = this.frightenedTarget;
    } else if (this.state === GhostState.CHASE) {
      target = this.getChaseTarget(pacmanTile);
    } else {
      // SCATTER - go to home corner
      target = this.getScatterTarget();
    }

    this.moveTowardsTarget(target);
  }

  /**
   * Get chase target based on ghost personality
   */
  private getChaseTarget(pacmanTile: TilePosition): TilePosition {
    switch (this.type) {
      case GhostType.BLINKY:
        // Directly chase Pacman
        return pacmanTile;

      case GhostType.PINKY:
        // Target 4 tiles ahead of Pacman
        return {
          row: Math.max(0, pacmanTile.row - 4),
          col: pacmanTile.col,
        };

      case GhostType.INKY:
        // Target based on Blinky's position (simplified)
        return {
          row: pacmanTile.row + 2,
          col: pacmanTile.col + 2,
        };

      case GhostType.CLYDE:
        // Chase if far, scatter if close
        const currentTile = this.getTilePosition();
        const distance =
          Math.abs(currentTile.row - pacmanTile.row) +
          Math.abs(currentTile.col - pacmanTile.col);
        return distance > 8 ? pacmanTile : this.getScatterTarget();

      default:
        return pacmanTile;
    }
  }

  /**
   * Get scatter target (home corner)
   */
  private getScatterTarget(): TilePosition {
    const mapData = this.mapManager.getMapData();
    if (!mapData) return this.homePosition;

    switch (this.type) {
      case GhostType.BLINKY:
        return { row: 1, col: mapData.width - 2 };
      case GhostType.PINKY:
        return { row: 1, col: 1 };
      case GhostType.INKY:
        return { row: mapData.height - 2, col: mapData.width - 2 };
      case GhostType.CLYDE:
        return { row: mapData.height - 2, col: 1 };
      default:
        return this.homePosition;
    }
  }

  /**
   * Check if two directions are opposite
   */
  private isOppositeDirection(dir1: TilePosition, dir2: TilePosition): boolean {
    return dir1.row === -dir2.row && dir1.col === -dir2.col;
  }

  /**
   * Get a random direction for frightened ghost
   * Excludes the opposite direction unless it's a dead end
   */
  private getFrightenedDirection(
    currentTile: TilePosition
  ): TilePosition | null {
    const validNeighbors = getNeighbors(
      currentTile,
      this.mapManager.getMapData()!.layout,
      1
    );

    if (validNeighbors.length === 0) return null;

    // If only one direction (dead end), must go back
    if (validNeighbors.length === 1) {
      return validNeighbors[0]!;
    }

    // Filter out the opposite direction if we have a last direction
    let availableNeighbors = validNeighbors;
    if (this.lastDirection) {
      availableNeighbors = validNeighbors.filter((neighbor) => {
        const direction = {
          row: neighbor.row - currentTile.row,
          col: neighbor.col - currentTile.col,
        };
        return !this.isOppositeDirection(direction, this.lastDirection!);
      });
    }

    // If filtering left us with no options (shouldn't happen), use all neighbors
    if (availableNeighbors.length === 0) {
      availableNeighbors = validNeighbors;
    }

    // Pick a random direction from available options
    const randomIndex = Math.floor(Math.random() * availableNeighbors.length);
    return availableNeighbors[randomIndex]!;
  }

  /**
   * Move towards target tile using pathfinding
   */
  private moveTowardsTarget(target: TilePosition): void {
    const currentTile = this.getTilePosition();
    const mapData = this.mapManager.getMapData();
    if (!mapData) return;

    let nextTile: TilePosition | null = null;

    // For frightened ghosts, move directly to target without pathfinding
    if (this.state === GhostState.FRIGHTENED) {
      nextTile = target;
    } else {
      // Find next tile in path using A* pathfinding
      // When eaten, allow pathfinding to wall tiles (ghost can enter ghost house)
      const wallTile = this.state === GhostState.EATEN ? -1 : 1;
      nextTile = findPath(currentTile, target, mapData.layout, wallTile);
    }

    if (nextTile) {
      // Update last direction for frightened movement
      const direction = {
        row: nextTile.row - currentTile.row,
        col: nextTile.col - currentTile.col,
      };
      this.lastDirection = direction;

      // Move towards next tile (apply offset to convert to screen space)
      const nextPos = tileToPixelCentered(nextTile.row, nextTile.col);
      const targetX = nextPos.x + this.mapOffset.x;
      const targetY = nextPos.y + this.mapOffset.y;

      const dx = targetX - this.sprite.x;
      const dy = targetY - this.sprite.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > 0) {
        const moveX = (dx / distance) * this.speed;
        const moveY = (dy / distance) * this.speed;

        this.sprite.x += moveX;
        this.sprite.y += moveY;
      }
    }
  }

  /**
   * Get current tile position
   */
  getTilePosition(): TilePosition {
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
   * Handle being eaten by Pacman
   */
  getEaten(): void {
    this.setState(GhostState.EATEN);
  }

  /**
   * Check if ghost can be eaten
   */
  canBeEaten(): boolean {
    return this.state === GhostState.FRIGHTENED;
  }

  /**
   * Check if ghost is dangerous to Pacman
   */
  isDangerous(): boolean {
    return this.state === GhostState.CHASE || this.state === GhostState.SCATTER;
  }

  /**
   * Clean up
   */
  destroy(): void {
    if (this.stateTimer) {
      this.stateTimer.destroy();
    }
    this.sprite.destroy();
  }
}
