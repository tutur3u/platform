import { GAME_CONFIG } from '../config';
import type { MapManager } from '../managers/MapManager';
import { GhostState, GhostType } from '../types';
import type { TilePosition } from '../types';
import { pixelToTile, tileToPixelCentered } from '../utils/constants';
import { findPath, getRandomNeighbor } from '../utils/pathfinding';
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
    const colors = {
      [GhostType.BLINKY]: 0xff0000,
      [GhostType.PINKY]: 0xffb8ff,
      [GhostType.INKY]: 0x00ffff,
      [GhostType.CLYDE]: 0xffb851,
    };
    this.sprite.setFillStyle(colors[this.type]);
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
      // Random movement when frightened
      const currentTile = this.getTilePosition();
      const randomTarget = getRandomNeighbor(
        currentTile,
        this.mapManager.getMapData()!.layout
      );
      target = randomTarget || pacmanTile;
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
   * Move towards target tile using pathfinding
   */
  private moveTowardsTarget(target: TilePosition): void {
    const currentTile = this.getTilePosition();
    const mapData = this.mapManager.getMapData();
    if (!mapData) return;

    // Find next tile in path
    const nextTile = findPath(currentTile, target, mapData.layout);

    if (nextTile) {
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
