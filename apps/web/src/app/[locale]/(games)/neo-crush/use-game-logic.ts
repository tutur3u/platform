// use-game-logic.ts
import { BOARD_SIZE, Fruit, FruitColor, PTS_PER_FRUIT } from './types';
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

  // Helper function to erase fruits of a specific color
  function eraseColor(fruits: Fruit[], color: FruitColor) {
    console.log('Erasing color:', color);
    const newFruits = fruits.map((fruit) =>
      fruit?.color === color ? undefined : fruit
    );
    console.log(
      'Erased fruits:',
      newFruits.filter((fruit) => fruit === undefined).length
    );

    return newFruits;
  }

  // Helper function to erase an entire row
  function eraseRow(fruits: Fruit[], rowIndex: number, boardSize: number) {
    console.log('Erasing row:', rowIndex);
    const newFruits = fruits.map((fruit, index) =>
      Math.floor(index / boardSize) === rowIndex ? undefined : fruit
    );
    console.log(
      'Erased fruits:',
      newFruits.filter((fruit) => fruit === undefined).length
    );

    return newFruits;
  }

  // Helper function to erase an entire column
  function eraseColumn(fruits: Fruit[], colIndex: number, boardSize: number) {
    console.log('Erasing column:', colIndex);
    const newFruits = fruits.map((fruit, index) =>
      index % boardSize === colIndex ? undefined : fruit
    );
    console.log(
      'Erased fruits:',
      newFruits.filter((fruit) => fruit === undefined).length
    );

    return newFruits;
  }

  const handleSpecialFruits = useCallback(
    (draggedId: number, replacedId: number, fruits: Fruit[]) => {
      let newFruits = [...fruits];
      let erasedFruits = 0;

      const draggedFruit = newFruits[draggedId];
      const replacedFruit = newFruits[replacedId];

      console.log('Handling special fruits:', draggedFruit, replacedFruit);

      if (draggedFruit?.type === 'normal' && replacedFruit?.type === 'normal') {
        // newFruits[draggedId] = replacedFruit;
        // newFruits[replacedId] = draggedFruit;
        return newFruits;
      }

      if (
        draggedFruit?.type === 'rainbow' ||
        replacedFruit?.type === 'rainbow'
      ) {
        const fruitColorToErase =
          draggedFruit?.type !== 'rainbow'
            ? draggedFruit?.color
            : replacedFruit?.color;

        newFruits = eraseColor(newFruits, fruitColorToErase!);
        erasedFruits += newFruits.filter((fruit) => fruit === undefined).length;
        setScore((score) => score + erasedFruits * PTS_PER_FRUIT);
      } else if (
        draggedFruit?.type === 'horizontal' ||
        replacedFruit?.type === 'horizontal'
      ) {
        const rowIndex = Math.floor(
          (draggedFruit?.type === 'horizontal' ? draggedId : replacedId) /
            BOARD_SIZE
        );
        newFruits = eraseRow(newFruits, rowIndex, BOARD_SIZE);
        erasedFruits += newFruits.filter((fruit) => fruit === undefined).length;
        setScore((score) => score + erasedFruits * PTS_PER_FRUIT);
      } else if (
        draggedFruit?.type === 'vertical' ||
        replacedFruit?.type === 'vertical'
      ) {
        const colIndex =
          (draggedFruit?.type === 'vertical' ? draggedId : replacedId) %
          BOARD_SIZE;
        newFruits = eraseColumn(newFruits, colIndex, BOARD_SIZE);
        erasedFruits += newFruits.filter((fruit) => fruit === undefined).length;
        setScore((score) => score + erasedFruits * PTS_PER_FRUIT);
      }

      if (draggedFruit?.type !== 'normal') {
        newFruits[draggedId] = undefined;
      }

      if (replacedFruit?.type !== 'normal') {
        newFruits[replacedId] = undefined;
      }

      return newFruits;
    },
    [fruits, setScore]
  );

  return { checkMatches, moveIntoSquareBelow, handleSpecialFruits };
};
