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
        const randomColor =
          Object.values(FruitColors)[
            Math.floor(Math.random() * Object.values(FruitColors).length)
          ];
        currentColorArrangement[i] = randomColor!;
      }

      if (currentColorArrangement[i + width] === undefined) {
        currentColorArrangement[i + width] = currentColorArrangement[i]!;
        currentColorArrangement[i] = undefined!;
      }
    }
  }, [currentColorArrangement]);

  return { checkMatches, moveIntoSquareBelow };
};
