import { GAME_CONFIG } from '../config';
import type { Position, TilePosition } from '../types';

/**
 * Convert pixel position to tile position
 */
export function pixelToTile(x: number, y: number): TilePosition {
  return {
    row: Math.floor(y / GAME_CONFIG.TILE_SIZE),
    col: Math.floor(x / GAME_CONFIG.TILE_SIZE),
  };
}

/**
 * Convert tile position to pixel position (top-left corner)
 */
export function tileToPixel(row: number, col: number): Position {
  return {
    x: col * GAME_CONFIG.TILE_SIZE,
    y: row * GAME_CONFIG.TILE_SIZE,
  };
}

/**
 * Convert tile position to centered pixel position
 */
export function tileToPixelCentered(row: number, col: number): Position {
  return {
    x: col * GAME_CONFIG.TILE_SIZE + GAME_CONFIG.TILE_SIZE / 2,
    y: row * GAME_CONFIG.TILE_SIZE + GAME_CONFIG.TILE_SIZE / 2,
  };
}

/**
 * Check if a position is aligned with tile center
 */
export function isAlignedWithTile(x: number, y: number): boolean {
  const halfTile = GAME_CONFIG.TILE_SIZE / 2;
  const xOffset = (x - halfTile) % GAME_CONFIG.TILE_SIZE;
  const yOffset = (y - halfTile) % GAME_CONFIG.TILE_SIZE;

  return Math.abs(xOffset) < 1 && Math.abs(yOffset) < 1;
}

/**
 * Get the center of the current tile
 */
export function getTileCenter(x: number, y: number): Position {
  const tile = pixelToTile(x, y);
  return tileToPixelCentered(tile.row, tile.col);
}
