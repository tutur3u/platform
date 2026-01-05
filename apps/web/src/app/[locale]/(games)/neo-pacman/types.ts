export interface MapData {
  width: number;
  height: number;
  layout: number[][];
}

export interface Position {
  x: number;
  y: number;
}

export interface TilePosition {
  row: number;
  col: number;
}

export enum Direction {
  UP = 'UP',
  DOWN = 'DOWN',
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
  NONE = 'NONE',
}

export enum GhostState {
  CHASE = 'CHASE',
  SCATTER = 'SCATTER',
  FRIGHTENED = 'FRIGHTENED',
  EATEN = 'EATEN',
}

export enum GhostType {
  BLINKY = 'BLINKY', // Red - Direct chaser
  PINKY = 'PINKY', // Pink - Ambusher
  INKY = 'INKY', // Blue - Flanker
  CLYDE = 'CLYDE', // Orange - Random
}

export enum FoodType {
  PELLET = 'PELLET',
  POWER_PELLET = 'POWER_PELLET',
  APPLE = 'APPLE',
  STRAWBERRY = 'STRAWBERRY',
}

export interface MapDataJson {
  name: string;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Expert';
  data: number[][];
}

export enum TileType {
  EMPTY = 0,
  WALL = 1,
  FOOD = 2,
  POWER_PELLET = 3,
  PACMAN = 4,
  GHOST_BLINKY = 5,
  GHOST_PINKY = 6,
  GHOST_INKY = 7,
  GHOST_CLYDE = 8,
}
