// use-game-logic.ts
import { Fruit, width } from './types';
import { checkForMatches, createRandomFruit } from './utils';
import { useCallback } from 'react';

export const useGameLogic = (
  fruits: Fruit[],
  setFruits: React.Dispatch<React.SetStateAction<Fruit[]>>,
  setScore: React.Dispatch<React.SetStateAction<number>>
) => {
  const scoreUpdated = useRef(false);

  const checkMatches = useCallback(() => {
    const hasMatch = checkForMatches(fruits, setFruits, setScore, scoreUpdated);
    if (hasMatch) {
      scoreUpdated.current = true;
    } else {
      scoreUpdated.current = false;
    }
  }, [fruits, setFruits, setScore]);

  const moveIntoSquareBelow = useCallback(() => {
    const newFruits = [...fruits];
    let fruitsMoved = false;

    for (let i = width * width - 1; i >= width; i--) {
      if (newFruits[i] === undefined) {
        if (newFruits[i - width] !== undefined) {
          newFruits[i] = newFruits[i - width];
          newFruits[i - width] = undefined;
          fruitsMoved = true;
        }
      }
    }

    // Fill the top row with new fruits if empty
    for (let i = 0; i < width; i++) {
      if (newFruits[i] === undefined) {
        newFruits[i] = createRandomFruit();
        fruitsMoved = true;
      }
    }

    if (fruitsMoved) {
      setFruits(newFruits);
    }

    return fruitsMoved;
  }, [fruits, setFruits]);

  const handleSpecialFruits = useCallback(
    (draggedId: number, replacedId: number) => {
      const newFruits = [...fruits];
      const draggedFruit = newFruits[draggedId];
      const replacedFruit = newFruits[replacedId];

      if (
        draggedFruit?.type === 'horizontal' ||
        replacedFruit?.type === 'horizontal'
      ) {
        const lineEraserIndex =
          draggedFruit?.type === 'horizontal' ? draggedId : replacedId;
        const row = Math.floor(lineEraserIndex / width);

        // Erase the entire row
        for (let i = 0; i < width; i++) {
          newFruits[row * width + i] = undefined;
        }
        setScore((score) => score + width);
      } else if (
        draggedFruit?.type === 'vertical' ||
        replacedFruit?.type === 'vertical'
      ) {
        const lineEraserIndex =
          draggedFruit?.type === 'vertical' ? draggedId : replacedId;
        const col = lineEraserIndex % width;

        // Erase the entire column
        for (let i = 0; i < width; i++) {
          newFruits[i * width + col] = undefined;
        }
        setScore((score) => score + width);
      }

      // Ensure the special fruit is destroyed after use
      newFruits[draggedId] = undefined;
      newFruits[replacedId] = undefined;

      // Update the fruits state
      setFruits(newFruits);
    },
    [fruits, setFruits, setScore]
  );

  return { checkMatches, moveIntoSquareBelow, handleSpecialFruits };
};
