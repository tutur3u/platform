export const GAME_CONFIG = {
  // Tile configuration
  TILE_SIZE: 25,

  // Movement speeds (frames per tile move - lower = faster)
  PACMAN_SPEED: 10, // Move 1 tile every 10 frames (6 tiles/sec at 60fps)
  GHOST_SPEED: 10,
  GHOST_FRIGHTENED_SPEED: 20, // Slower when frightened
  GHOST_EATEN_SPEED: 5, // Faster return to home

  // Timings
  POWER_DURATION: 10000, // 10 seconds
  GHOST_CHASE_TIME: 20000, // 20 seconds
  GHOST_SCATTER_TIME: 7000, // 7 seconds
  FRUIT_SPAWN_INTERVAL: 30000, // 30 seconds

  // Fruit spawn rates
  APPLE_SPAWN_RATE: 0.05,
  STRAWBERRY_SPAWN_RATE: 0.15,

  // Scoring
  PELLET_POINTS: 10,
  POWER_PELLET_POINTS: 50,
  GHOST_POINTS: 200,
  APPLE_POINTS: 700,
  STRAWBERRY_POINTS: 300,

  // Game rules
  INITIAL_LIVES: 3,
} as const;
