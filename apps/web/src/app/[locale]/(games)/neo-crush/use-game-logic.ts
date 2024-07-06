// use-game-logic.ts
import { BOARD_SIZE, Fruit } from './types';
import { checkForMatches, createRandomFruit } from './utils';
import { useCallback, useState } from 'react';

export const useGameLogic = (
  fruits: Fruit[],
  setFruits: React.Dispatch<React.SetStateAction<Fruit[]>>,
  setScore: React.Dispatch<React.SetStateAction<number>>
) => {
  const [scoreUpdated, setScoreUpdated] = useState(false);

  const checkMatches = useCallback(() => {
    const hasMatch = checkForMatches(fruits, setFruits, setScore, scoreUpdated);
    setScoreUpdated(hasMatch);
  }, [fruits, setFruits, setScore]);

  const moveIntoSquareBelow = useCallback(() => {
    const newFruits = [...fruits];
    let fruitsMoved = false;

    for (let i = BOARD_SIZE * BOARD_SIZE - 1; i >= BOARD_SIZE; i--) {
      if (newFruits[i] === undefined) {
        if (newFruits[i - BOARD_SIZE] !== undefined) {
          newFruits[i] = newFruits[i - BOARD_SIZE];
          newFruits[i - BOARD_SIZE] = undefined;
          fruitsMoved = true;
        }
      }
    }

    // Fill the top row with new fruits if empty
    for (let i = 0; i < BOARD_SIZE; i++) {
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
      // rainbow fruit
      if (
        draggedFruit?.type === 'rainbow' ||
        replacedFruit?.type === 'rainbow'
      ) {
        const fruitColorToErase =
          draggedFruit?.type !== 'rainbow'
            ? draggedFruit?.color
            : replacedFruit?.color;

        newFruits.forEach((fruit, index) => {
          if (fruit?.color === fruitColorToErase) {
            newFruits[index] = undefined;
          }
        });

        setScore((score) => score + BOARD_SIZE * BOARD_SIZE);
      }
      if (
        draggedFruit?.type === 'horizontal' ||
        replacedFruit?.type === 'horizontal'
      ) {
        const lineEraserIndex =
          draggedFruit?.type === 'horizontal' ? draggedId : replacedId;
        const row = Math.floor(lineEraserIndex / BOARD_SIZE);

        // Erase the entire row
        for (let i = 0; i < BOARD_SIZE; i++) {
          newFruits[row * BOARD_SIZE + i] = undefined;
        }
        setScore((score) => score + BOARD_SIZE);
      } else if (
        draggedFruit?.type === 'vertical' ||
        replacedFruit?.type === 'vertical'
      ) {
        const lineEraserIndex =
          draggedFruit?.type === 'vertical' ? draggedId : replacedId;
        const col = lineEraserIndex % BOARD_SIZE;

        // Erase the entire column
        for (let i = 0; i < BOARD_SIZE; i++) {
          newFruits[i * BOARD_SIZE + col] = undefined;
        }
        setScore((score) => score + BOARD_SIZE);
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
