'use client';

import { GameStateManager } from '../engine/gameState';
import { useCallback, useEffect, useState } from 'react';

const GRID_SIZE = 20;
const CELL_SIZE = 30;

export function GameBoard() {
  const [gameManager] = useState(() => new GameStateManager(GRID_SIZE));
  const [playerPos, setPlayerPos] = useState(() =>
    gameManager.getPlayerPosition()
  );
  const [lastMoveTime, setLastMoveTime] = useState(0);

  const handleMove = useCallback(
    (direction: 'up' | 'down' | 'left' | 'right') => {
      const now = Date.now();
      // Prevent rapid movement (debounce)
      if (now - lastMoveTime < 100) return;

      const success = gameManager.movePlayer(direction);
      if (success) {
        setPlayerPos(gameManager.getPlayerPosition());
        setLastMoveTime(now);
      }
    },
    [gameManager, lastMoveTime]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      let direction: 'up' | 'down' | 'left' | 'right' | null = null;

      switch (event.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          direction = 'up';
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          direction = 'down';
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          direction = 'left';
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          direction = 'right';
          break;
        case ' ':
          // Space bar to pause/resume
          event.preventDefault();
          if (gameManager.getState().isGameRunning) {
            gameManager.pauseGame();
          } else {
            gameManager.resumeGame();
          }
          return;
      }

      if (direction) {
        event.preventDefault();
        handleMove(direction);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleMove, gameManager]);

  const gameState = gameManager.getState();

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center gap-4">
        <div className="text-lg font-semibold">
          Position: ({playerPos.getX()}, {playerPos.getY()})
        </div>
        <div
          className={`rounded px-2 py-1 text-sm font-medium ${
            gameState.isGameRunning
              ? 'bg-dynamic-green/20 text-dynamic-green'
              : 'bg-dynamic-red/20 text-dynamic-red'
          }`}
        >
          {gameState.isGameRunning ? 'Playing' : 'Paused'}
        </div>
      </div>

      <div
        className="relative overflow-hidden rounded-lg border-2 border-dynamic-gray/30 bg-dynamic-gray/5"
        style={{
          width: GRID_SIZE * CELL_SIZE,
          height: GRID_SIZE * CELL_SIZE,
        }}
      >
        {/* Grid cells */}
        {Array.from({ length: GRID_SIZE }, (_, y) =>
          Array.from({ length: GRID_SIZE }, (_, x) => (
            <div
              key={`${x}-${y}`}
              className="absolute border border-dynamic-gray/10"
              style={{
                left: x * CELL_SIZE,
                top: y * CELL_SIZE,
                width: CELL_SIZE,
                height: CELL_SIZE,
              }}
            />
          ))
        )}

        {/* Player */}
        <div
          className={`absolute rounded-full border-2 shadow-lg transition-all duration-200 ease-out ${
            gameState.isGameRunning
              ? 'border-dynamic-blue/30 bg-dynamic-blue shadow-dynamic-blue/20'
              : 'border-dynamic-gray/30 bg-dynamic-gray shadow-dynamic-gray/20'
          }`}
          style={{
            left: playerPos.getX() * CELL_SIZE + 2,
            top: playerPos.getY() * CELL_SIZE + 2,
            width: CELL_SIZE - 4,
            height: CELL_SIZE - 4,
          }}
        />

        {/* Movement indicator */}
        <div
          className="absolute animate-pulse rounded-full border border-dynamic-blue/30 bg-dynamic-blue/20"
          style={{
            left: playerPos.getX() * CELL_SIZE + 1,
            top: playerPos.getY() * CELL_SIZE + 1,
            width: CELL_SIZE - 2,
            height: CELL_SIZE - 2,
          }}
        />
      </div>

      <div className="space-y-1 text-center text-sm text-dynamic-gray/70">
        <div>Use arrow keys or WASD to move</div>
        <div>Press spacebar to pause/resume</div>
      </div>
    </div>
  );
}
