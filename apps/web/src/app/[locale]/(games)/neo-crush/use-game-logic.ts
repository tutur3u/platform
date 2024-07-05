// use-game-logic.ts
import { FruitColor, FruitColors, width } from './types';
import { checkForMatches } from './utils';
import { useCallback } from 'react';

export const useGameLogic = (
  currentColorArrangement: FruitColor[],
  setCurrentColorArrangement: React.Dispatch<
    React.SetStateAction<FruitColor[]>
  >,
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
          (color) =>
            color !== 'horizontalLineEraser' && color !== 'verticalLineEraser'
        )[Math.floor(Math.random() * (Object.values(FruitColors).length - 3))];
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

      if (
        draggedColor === 'horizontalLineEraser' ||
        replacedColor === 'horizontalLineEraser'
      ) {
        const lineEraserIndex =
          draggedColor === 'horizontalLineEraser' ? draggedId : replacedId;
        const row = Math.floor(lineEraserIndex / width);

        // Erase the entire row
        for (let i = 0; i < width; i++) {
          currentColorArrangement[row * width + i] = undefined!;
        }
        setScore((score) => score + width);
      } else if (
        draggedColor === 'verticalLineEraser' ||
        replacedColor === 'verticalLineEraser'
      ) {
        const lineEraserIndex =
          draggedColor === 'verticalLineEraser' ? draggedId : replacedId;
        const col = lineEraserIndex % width;

        // Erase the entire column
        for (let i = 0; i < width; i++) {
          currentColorArrangement[i * width + col] = undefined!;
        }
        setScore((score) => score + width);

        // Ensure the special fruit is destroyed after use
        currentColorArrangement[draggedId] = undefined!;
        currentColorArrangement[replacedId] = undefined!;

        // Ensure the currentColorArrangement state is updated
        setCurrentColorArrangement([...currentColorArrangement]);
      }
    },
    [currentColorArrangement, setCurrentColorArrangement, setScore]
  );

  return { checkMatches, moveIntoSquareBelow, handleSpecialFruits };
};
