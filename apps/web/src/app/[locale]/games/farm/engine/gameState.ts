import { Player } from './player';
import { Position } from './position';

export interface GameState {
  player: Player;
  gridSize: number;
  isGameRunning: boolean;
}

export class GameStateManager {
  private state: GameState;

  constructor(gridSize: number = 20) {
    this.state = {
      player: new Player(
        new Position(Math.floor(gridSize / 2), Math.floor(gridSize / 2))
      ),
      gridSize,
      isGameRunning: true,
    };
  }

  getState(): GameState {
    return { ...this.state };
  }

  movePlayer(direction: 'up' | 'down' | 'left' | 'right'): boolean {
    if (!this.state.isGameRunning) return false;

    const newPlayer = new Player(
      new Position(
        this.state.player.getPosition().getX(),
        this.state.player.getPosition().getY()
      )
    );

    newPlayer.move(direction);

    // Check bounds
    const pos = newPlayer.getPosition();
    if (
      pos.getX() < 0 ||
      pos.getX() >= this.state.gridSize ||
      pos.getY() < 0 ||
      pos.getY() >= this.state.gridSize
    ) {
      return false; // Movement blocked by bounds
    }

    this.state.player = newPlayer;
    return true;
  }

  getPlayerPosition(): Position {
    return this.state.player.getPosition();
  }

  pauseGame(): void {
    this.state.isGameRunning = false;
  }

  resumeGame(): void {
    this.state.isGameRunning = true;
  }
}
