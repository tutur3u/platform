// use-game-logic.ts
import { FruitColor, FruitColors, width } from './types';
import { checkForMatches } from './utils';
import { useCallback } from 'react';

export const useGameLogic = (
  currentColorArrangement: FruitColor[],
  setScore: React.Dispatch<React.SetStateAction<number>>
) => {
  const checkMatches = useCallback(() => {
    return checkForMatches(currentColorArrangement, setScore);
  }, [currentColorArrangement, setScore]);

  const moveIntoSquareBelow = useCallback(() => {
    for (let i = 0; i <= 55; i++) {
      const isFirstRow = i >= 0 && i <= 7;

      if (isFirstRow && currentColorArrangement[i] === undefined) {
        const randomColor = Object.values(FruitColors).filter(
          (color) => color !== 'lineEraser'
        )[Math.floor(Math.random() * (Object.values(FruitColors).length - 2))];
        currentColorArrangement[i] = randomColor!;
      }

      if (currentColorArrangement[i + width] === undefined) {
        currentColorArrangement[i + width] = currentColorArrangement[i]!;
        currentColorArrangement[i] = undefined!;
      }
    }
  }, [currentColorArrangement]);

  const handleSpecialFruits = useCallback(
    (draggedId: number, replacedId: number) => {
      const draggedColor = currentColorArrangement[draggedId];
      const replacedColor = currentColorArrangement[replacedId];

      if (draggedColor === 'lineEraser' || replacedColor === 'lineEraser') {
        const lineEraserIndex =
          draggedColor === 'lineEraser' ? draggedId : replacedId;
        const row = Math.floor(lineEraserIndex / width);
        const col = lineEraserIndex % width;

        // Erase the entire row and column
        for (let i = 0; i < width; i++) {
          currentColorArrangement[row * width + i] = undefined!;
          currentColorArrangement[i * width + col] = undefined!;
        }
        setScore((score) => score + width * 2 - 1); // Add score for erased fruits
      }
    },
    [currentColorArrangement, setScore]
  );

  return { checkMatches, moveIntoSquareBelow, handleSpecialFruits };
};
