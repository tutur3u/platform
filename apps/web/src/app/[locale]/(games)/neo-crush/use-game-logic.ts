// use-game-logic.ts
import { BOARD_SIZE, Fruit } from './types';
import { checkForMatches, createRandomFruit } from './utils';
import { useCallback } from 'react';

export const useGameLogic = (
  fruits: (Fruit | undefined)[],
  setFruits: React.Dispatch<React.SetStateAction<(Fruit | undefined)[]>>,
  setScore: React.Dispatch<React.SetStateAction<number>>
) => {
  const checkMatches = useCallback(() => {
    return checkForMatches(fruits, setFruits, setScore);
  }, [fruits]);

  const moveIntoSquareBelow = useCallback(() => {
    let fruitsMoved = false;

    for (let i = BOARD_SIZE * BOARD_SIZE - 1; i >= BOARD_SIZE; i--) {
      if (fruits[i] === undefined) {
        if (fruits[i - BOARD_SIZE] !== undefined) {
          fruits[i] = fruits[i - BOARD_SIZE];
          fruits[i - BOARD_SIZE] = undefined;
          fruitsMoved = true;
        }
      }
    }

    // Fill the top row with new fruits if empty
    for (let i = 0; i < BOARD_SIZE; i++) {
      if (fruits[i] === undefined) {
        fruits[i] = createRandomFruit();
        fruitsMoved = true;
      }
    }

    if (fruitsMoved) {
      setFruits([...fruits]);
    }

    return fruitsMoved;
  }, [fruits]);

  return { checkMatches, moveIntoSquareBelow };
};
