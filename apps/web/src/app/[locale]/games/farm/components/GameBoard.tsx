'use client';

import type { CropType } from '../engine/crop';
import { GameStateManager } from '../engine/gameState';
import { CropRenderer } from './CropRenderer';
import { FarmingUI } from './FarmingUI';
import { WeatherDisplay } from './WeatherDisplay';
import { useCallback, useEffect, useState } from 'react';

const GRID_SIZE = 20;
const CELL_SIZE = 30;

export function GameBoard() {
  const [gameManager] = useState(() => new GameStateManager(GRID_SIZE));
  const [playerPos, setPlayerPos] = useState(() =>
    gameManager.getPlayerPosition()
  );
  const [lastMoveTime, setLastMoveTime] = useState(0);
  const [gameState, setGameState] = useState(() => gameManager.getState());

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

  const handleToolSelect = useCallback(
    (tool: 'plant' | 'water' | 'harvest' | null) => {
      gameManager.setSelectedTool(tool);
      setGameState(gameManager.getState());
    },
    [gameManager]
  );

  const handleSeedSelect = useCallback(
    (seed: CropType | null) => {
      gameManager.setSelectedSeed(seed);
      setGameState(gameManager.getState());
    },
    [gameManager]
  );

  const handleBuySeeds = useCallback(
    (type: CropType, quantity: number) => {
      gameManager.getInventory().buySeeds(type, quantity);
      setGameState(gameManager.getState());
    },
    [gameManager]
  );

  const handleSellCrops = useCallback(
    (type: CropType, quantity: number) => {
      gameManager.getInventory().sellCrop(type, quantity);
      setGameState(gameManager.getState());
    },
    [gameManager]
  );

  const handleAction = useCallback(() => {
    const success = gameManager.performAction();
    if (success) {
      setGameState(gameManager.getState());
    }
  }, [gameManager]);

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
          // Space bar for action
          event.preventDefault();
          handleAction();
          return;
        case 'Escape':
          // Escape to clear selection
          event.preventDefault();
          handleToolSelect(null);
          return;
      }

      if (direction) {
        event.preventDefault();
        handleMove(direction);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleMove, handleAction, handleToolSelect]);

  // Update crops every second
  useEffect(() => {
    const interval = setInterval(() => {
      gameManager.updateCrops();
      setGameState(gameManager.getState());
    }, 1000);

    return () => clearInterval(interval);
  }, [gameManager]);

  const allCrops = gameManager.getAllCrops();
  const currentCrop = gameManager.getCropAt(playerPos.getX(), playerPos.getY());

  return (
    <div className="flex gap-6">
      {/* Game Board */}
      <div className="flex flex-col items-center gap-4">
        {/* Status Bar */}
        <div className="flex items-center gap-6">
          <div className="font-semibold text-lg">
            Position: ({playerPos.getX()}, {playerPos.getY()})
          </div>
          <div
            className={`rounded px-3 py-1 font-medium text-sm ${
              gameState.isGameRunning
                ? 'bg-dynamic-green/20 text-dynamic-green'
                : 'bg-dynamic-red/20 text-dynamic-red'
            }`}
          >
            {gameState.isGameRunning ? 'Playing' : 'Paused'}
          </div>
          {gameState.selectedTool && (
            <div className="rounded bg-dynamic-blue/20 px-3 py-1 font-medium text-dynamic-blue text-sm">
              Tool: {gameState.selectedTool}
            </div>
          )}
          {gameState.selectedSeed && (
            <div className="rounded bg-dynamic-orange/20 px-3 py-1 font-medium text-dynamic-orange text-sm">
              Seed: {gameState.selectedSeed}
            </div>
          )}
        </div>

        {/* Current Cell Info */}
        {currentCrop && (
          <div className="rounded bg-dynamic-gray/10 p-3 text-center">
            <div className="font-semibold text-sm">Current Cell</div>
            <div className="text-dynamic-gray/70 text-xs">
              {currentCrop.isHarvestable()
                ? 'Ready to harvest!'
                : currentCrop.isDead()
                  ? 'Crop is dead'
                  : `Water: ${Math.round((currentCrop.getData().waterLevel / currentCrop.getData().maxWaterLevel) * 100)}%`}
            </div>
          </div>
        )}

        {/* Game Grid */}
        <div className="relative">
          <div
            className="relative overflow-hidden rounded-lg border-2 border-dynamic-gray/30 bg-dynamic-gray/5 shadow-lg"
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
                  className="absolute border border-dynamic-gray/10 transition-colors hover:bg-dynamic-gray/10"
                  style={{
                    left: x * CELL_SIZE,
                    top: y * CELL_SIZE,
                    width: CELL_SIZE,
                    height: CELL_SIZE,
                  }}
                />
              ))
            )}

            {/* Crops */}
            {Array.from(allCrops.entries()).map(([key, crop]) => {
              const [x, y] = key.split(',').map(Number);
              if (x === undefined || y === undefined) return null;

              return (
                <CropRenderer
                  key={key}
                  crop={crop}
                  cellSize={CELL_SIZE}
                  x={x}
                  y={y}
                />
              );
            })}

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
        </div>

        {/* Instructions */}
        <div className="space-y-1 text-center text-dynamic-gray/70 text-sm">
          <div>Use arrow keys or WASD to move</div>
          <div>Press SPACE to use selected tool</div>
          <div>Press ESC to clear selection</div>
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex flex-col gap-4">
        {/* Weather Display */}
        <WeatherDisplay weather={gameState.weather} />

        {/* Farming UI */}
        <FarmingUI
          inventory={gameState.inventory}
          selectedTool={gameState.selectedTool}
          selectedSeed={gameState.selectedSeed}
          onToolSelect={handleToolSelect}
          onSeedSelect={handleSeedSelect}
          onBuySeeds={handleBuySeeds}
          onSellCrops={handleSellCrops}
        />
      </div>
    </div>
  );
}
