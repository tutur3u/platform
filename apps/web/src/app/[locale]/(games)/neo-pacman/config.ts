import type { GameCallbacks } from './types';

export const GAME_CONFIG = {
  // Tile configuration
  TILE_SIZE: 25,

  // Movement speeds (pixels per frame at 60fps)
  PACMAN_SPEED: 2.5, // 1/8 tile per frame
  GHOST_SPEED: 2.5,
  GHOST_FRIGHTENED_SPEED: 1.0,
  GHOST_EATEN_SPEED: 0,

  // Food spawn rates (initial spawn)
  PELLET_RATE: 0.95,
  POWER_PELLET_RATE: 0.04,
  FRUIT_RATE: 0.01,

  // Timings
  POWER_DURATION: 10000, // 10 seconds
  GHOST_CHASE_TIME: 20000, // 20 seconds
  GHOST_SCATTER_TIME: 7000, // 7 seconds

  // Scoring
  PELLET_POINTS: 10,
  POWER_PELLET_POINTS: 50,
  FRUIT_POINTS: 100,
  GHOST_POINTS: 200,

  // Game rules
  INITIAL_LIVES: 3,
} as const;

export interface PhaserGameConfig {
  mapId: string;
  callbacks?: GameCallbacks;
}

// Ghost colors for rendering
export const GHOST_COLORS = {
  BLINKY: 0xff0000, // Red
  PINKY: 0xffb8ff, // Pink
  INKY: 0x00ffff, // Cyan
  CLYDE: 0xffb851, // Orange
} as const;

// Wall tile representation
export const TILE_WALL = 1;
export const TILE_EMPTY = 0;
