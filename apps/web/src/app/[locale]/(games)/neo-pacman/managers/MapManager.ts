import { GAME_CONFIG } from '../config';
import { MAPS_DATA } from '../maps';
import type { MapData, TilePosition } from '../types';
import { GhostType, TileType } from '../types';
import { tileToPixel } from '../utils/helpers';
import * as Phaser from 'phaser';

export interface MapEntities {
  pacmanSpawn: TilePosition | null;
  ghostSpawns: Map<GhostType, TilePosition>;
  foodPositions: TilePosition[];
  powerPelletPositions: TilePosition[];
}

export class MapManager {
  private scene: Phaser.Scene;
  private mapData: MapData | null = null;
  private wallTiles: Phaser.GameObjects.Rectangle[] = [];
  private wallsGroup: Phaser.Physics.Arcade.StaticGroup | null = null;
  private mapOffsetX: number = 0;
  private mapOffsetY: number = 0;
  private mapEntities: MapEntities | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /**
   * Load map from maps data
   */
  loadMap(mapId: string): MapData {
    const mapJson = MAPS_DATA[mapId];
    if (!mapJson) {
      throw new Error(`Map not found: ${mapId}`);
    }

    // Convert MapDataJson to MapData
    const mapData: MapData = {
      width: mapJson.data[0]?.length || 0,
      height: mapJson.data.length,
      layout: mapJson.data,
    };

    this.mapData = mapData;
    return mapData;
  }

  /**
   * Create tilemap visuals and process all entities in ONE PASS
   */
  createTilemap(mapData: MapData): void {
    this.mapData = mapData;
    this.wallTiles = [];

    // Initialize entity storage
    this.mapEntities = {
      pacmanSpawn: null,
      ghostSpawns: new Map<GhostType, TilePosition>(),
      foodPositions: [],
      powerPelletPositions: [],
    };

    // Create physics group for walls
    this.wallsGroup = this.scene.physics.add.staticGroup();

    // Calculate offset to center the map on screen
    const mapWidthInPixels = mapData.width * GAME_CONFIG.TILE_SIZE;
    const mapHeightInPixels = mapData.height * GAME_CONFIG.TILE_SIZE;
    const sceneWidth = this.scene.scale.width;
    const sceneHeight = this.scene.scale.height;

    this.mapOffsetX = (sceneWidth - mapWidthInPixels) / 2;
    this.mapOffsetY = (sceneHeight - mapHeightInPixels) / 2;

    // SINGLE PASS: Process all tiles and extract entity positions
    for (let row = 0; row < mapData.height; row++) {
      for (let col = 0; col < mapData.width; col++) {
        const tileType = mapData.layout[row]?.[col];
        const tilePos: TilePosition = { row, col };

        switch (tileType) {
          case TileType.WALL:
            // Create wall visual and physics
            const pos = tileToPixel(row, col);
            const wall = this.scene.add.rectangle(
              pos.x + GAME_CONFIG.TILE_SIZE / 2 + this.mapOffsetX,
              pos.y + GAME_CONFIG.TILE_SIZE / 2 + this.mapOffsetY,
              GAME_CONFIG.TILE_SIZE - 2,
              GAME_CONFIG.TILE_SIZE - 2,
              0x2121de // Blue wall color
            );
            this.wallsGroup.add(wall);
            this.wallTiles.push(wall);
            break;

          case TileType.FOOD:
            // Store food position
            this.mapEntities.foodPositions.push(tilePos);
            break;

          case TileType.POWER_PELLET:
            // Store power pellet position
            this.mapEntities.powerPelletPositions.push(tilePos);
            break;

          case TileType.PACMAN:
            // Store Pacman spawn position
            this.mapEntities.pacmanSpawn = tilePos;
            break;

          case TileType.GHOST_BLINKY:
            this.mapEntities.ghostSpawns.set(GhostType.BLINKY, tilePos);
            break;

          case TileType.GHOST_PINKY:
            this.mapEntities.ghostSpawns.set(GhostType.PINKY, tilePos);
            break;

          case TileType.GHOST_INKY:
            this.mapEntities.ghostSpawns.set(GhostType.INKY, tilePos);
            break;

          case TileType.GHOST_CLYDE:
            this.mapEntities.ghostSpawns.set(GhostType.CLYDE, tilePos);
            break;

          case TileType.EMPTY:
            // Empty tiles (paths around ghost house) - no action needed
            break;

          default:
            // Unknown tile type - ignore
            break;
        }
      }
    }
  }

  /**
   * Check if a tile position is a wall
   */
  isWall(row: number, col: number): boolean {
    if (!this.mapData) return true;
    if (
      row < 0 ||
      row >= this.mapData.height ||
      col < 0 ||
      col >= this.mapData.width
    ) {
      return true;
    }
    // Only TileType.WALL (1) is considered a wall
    return this.mapData.layout[row]?.[col] === TileType.WALL;
  }

  /**
   * Check if a pixel position is inside a wall
   */
  isWallAtPixel(x: number, y: number): boolean {
    if (!this.mapData) return true;

    // Adjust for map offset
    const adjustedX = x - this.mapOffsetX;
    const adjustedY = y - this.mapOffsetY;

    const col = Math.floor(adjustedX / GAME_CONFIG.TILE_SIZE);
    const row = Math.floor(adjustedY / GAME_CONFIG.TILE_SIZE);

    return this.isWall(row, col);
  }

  /**
   * Get all navigable (non-wall) tile positions
   */
  getNavigableTiles(): TilePosition[] {
    if (!this.mapData) return [];

    const navigable: TilePosition[] = [];

    for (let row = 0; row < this.mapData.height; row++) {
      for (let col = 0; col < this.mapData.width; col++) {
        // Any tile that's not a wall is navigable
        const tileType = this.mapData.layout[row]?.[col];
        if (tileType !== TileType.WALL) {
          navigable.push({ row, col });
        }
      }
    }

    return navigable;
  }

  /**
   * Get valid spawn points (navigable tiles not on edges)
   */
  getSpawnPoints(): TilePosition[] {
    if (!this.mapData) return [];

    const navigable = this.getNavigableTiles();
    // Filter out edge tiles for spawn points
    return navigable.filter(
      (tile) =>
        tile.row > 0 &&
        tile.row < this.mapData!.height - 1 &&
        tile.col > 0 &&
        tile.col < this.mapData!.width - 1
    );
  }

  /**
   * Get a random spawn point
   */
  getRandomSpawnPoint(): TilePosition | null {
    const spawnPoints = this.getSpawnPoints();
    if (spawnPoints.length === 0) return null;

    const randomIndex = Math.floor(Math.random() * spawnPoints.length);
    return spawnPoints[randomIndex] || null;
  }

  /**
   * Get the center spawn point (for ghost house)
   */
  getCenterSpawnPoint(): TilePosition {
    if (!this.mapData) {
      return { row: 0, col: 0 };
    }

    return {
      row: Math.floor(this.mapData.height / 2),
      col: Math.floor(this.mapData.width / 2),
    };
  }

  /**
   * Get map data
   */
  getMapData(): MapData | null {
    return this.mapData;
  }

  /**
   * Get all entity positions extracted from the map
   */
  getMapEntities(): MapEntities | null {
    return this.mapEntities;
  }

  /**
   * Get map dimensions in pixels
   */
  getMapDimensions(): { width: number; height: number } {
    if (!this.mapData) {
      return { width: 0, height: 0 };
    }

    return {
      width: this.mapData.width * GAME_CONFIG.TILE_SIZE,
      height: this.mapData.height * GAME_CONFIG.TILE_SIZE,
    };
  }

  /**
   * Get map offset for centering
   */
  getMapOffset(): { x: number; y: number } {
    return { x: this.mapOffsetX, y: this.mapOffsetY };
  }

  /**
   * Get walls physics group for collision detection
   */
  getWallsGroup(): Phaser.Physics.Arcade.StaticGroup | null {
    return this.wallsGroup;
  }

  /**
   * Clean up
   */
  destroy(): void {
    this.wallTiles.forEach((wall) => wall.destroy());
    this.wallTiles = [];
    this.wallsGroup?.clear(true, true);
    this.wallsGroup = null;
    this.mapData = null;
  }
}
