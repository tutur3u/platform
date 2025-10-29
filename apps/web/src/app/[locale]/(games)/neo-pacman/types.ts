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
  FRUIT = 'FRUIT',
}

export interface FoodItem {
  type: FoodType;
  position: TilePosition;
  points: number;
  sprite?: Phaser.GameObjects.GameObject;
}

export interface GameCallbacks {
  onScoreChange?: (score: number) => void;
  onLivesChange?: (lives: number) => void;
  onGameOver?: (won: boolean) => void;
  onPowerPelletEaten?: () => void;
}

export interface MapDataJson {
  name: string;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Expert';
  data: number[][];
}
