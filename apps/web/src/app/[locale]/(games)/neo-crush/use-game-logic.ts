import {
  BOARD_SIZE,
  Fruit,
  FruitColor,
  FruitType,
  Fruits,
  PTS_PER_FRUIT,
} from './types';
import { checkForMatches } from './utils';
import { useCallback, useRef } from 'react';

type EraseFunction = ({
  fruits,
  color,
  rowIndex,
  colIndex,
}: {
  fruits: Fruits;
  color: FruitColor;
  rowIndex: number;
  colIndex: number;
}) => Fruits;

export const eraseFunctions: Record<FruitType, EraseFunction> = {
  normal: ({ fruits }: { fruits: Fruits }) => fruits,
  rainbow: ({ fruits, color }: { fruits: Fruits; color: FruitColor }) =>
    fruits.map((fruit) =>
      fruit?.color === color && fruit.type === 'normal' ? undefined : fruit
    ),
  horizontal: ({ fruits, rowIndex }: { fruits: Fruits; rowIndex: number }) =>
    fruits.map((fruit, index) =>
      Math.floor(index / BOARD_SIZE) === rowIndex && fruit?.type === 'normal'
        ? undefined
        : fruit
    ),
  vertical: ({ fruits, colIndex }: { fruits: Fruits; colIndex: number }) =>
    fruits.map((fruit, index) =>
      index % BOARD_SIZE === colIndex && fruit?.type === 'normal'
        ? undefined
        : fruit
    ),
  plus: ({
    fruits,
    rowIndex,
    colIndex,
  }: {
    fruits: Fruits;
    rowIndex: number;
    colIndex: number;
  }) =>
    fruits.map((fruit, index) =>
      (Math.floor(index / BOARD_SIZE) === rowIndex ||
        index % BOARD_SIZE === colIndex) &&
      fruit?.type === 'normal'
        ? undefined
        : fruit
    ),
  explosive: ({
    fruits,
    rowIndex,
    colIndex,
  }: {
    fruits: Fruits;
    rowIndex: number;
    colIndex: number;
  }) =>
    fruits.map((fruit, index) => {
      const row = Math.floor(index / BOARD_SIZE);
      const col = index % BOARD_SIZE;
      return row >= rowIndex - 1 &&
        row <= rowIndex + 1 &&
        col >= colIndex - 1 &&
        col <= colIndex + 1 &&
        fruit?.type === 'normal'
        ? undefined
        : fruit;
    }),
  'big-explosive': ({
    fruits,
    rowIndex,
    colIndex,
  }: {
    fruits: Fruits;
    rowIndex: number;
    colIndex: number;
  }) => {
    const startRowIndex = Math.max(0, rowIndex - 1);
    const endRowIndex = Math.min(BOARD_SIZE - 1, rowIndex + 1);
    const startColIndex = Math.max(0, colIndex - 1);
    const endColIndex = Math.min(BOARD_SIZE - 1, colIndex + 1);

    return fruits.map((fruit, index) => {
      const row = Math.floor(index / BOARD_SIZE);
      const col = index % BOARD_SIZE;
      return ((row >= startRowIndex && row <= endRowIndex) ||
        (col >= startColIndex && col <= endColIndex)) &&
        fruit?.type === 'normal'
        ? undefined
        : fruit;
    });
  },
};

const specialCombinations: Record<
  string,
  (fruits: Fruits, color: FruitColor) => Fruits
> = {
  'rainbow-rainbow': (fruits: Fruits) =>
    fruits.map((fruit) => (fruit?.type === 'normal' ? undefined : fruit)),
  'rainbow-horizontal': (fruits: Fruits, color: FruitColor) =>
    fruits.map((fruit) =>
      fruit?.color === color
        ? { ...fruit, type: 'horizontal' as FruitType }
        : fruit
    ),
  'rainbow-vertical': (fruits: Fruits, color: FruitColor) =>
    fruits.map((fruit) =>
      fruit?.color === color
        ? { ...fruit, type: 'vertical' as FruitType }
        : fruit
    ),
  'rainbow-plus': (fruits: Fruits, color: FruitColor) =>
    fruits.map((fruit) =>
      fruit?.color === color ? { ...fruit, type: 'plus' as FruitType } : fruit
    ),
  'rainbow-explosive': (fruits: Fruits, color: FruitColor) =>
    fruits.map((fruit) =>
      fruit?.color === color
        ? { ...fruit, type: 'explosive' as FruitType }
        : fruit
    ),
  'rainbow-big-explosive': (fruits: Fruits, color: FruitColor) =>
    fruits.map((fruit) =>
      fruit?.color === color
        ? { ...fruit, type: 'big-explosive' as FruitType }
        : fruit
    ),
  // 'horizontal-horizontal': (fruits: Fruits) =>
  //   eraseFunctions.plus(fruits, 0, 0),
  // 'vertical-vertical': (fruits: Fruits) => eraseFunctions.plus(fruits, 0, 0),
  // 'horizontal-vertical': (fruits: Fruits) => eraseFunctions.plus(fruits, 0, 0),
  // 'horizontal-explosive': (fruits: Fruits) =>
  //   eraseFunctions['big-explosive'](fruits, 0, 0),
  // 'vertical-explosive': (fruits: Fruits) =>
  //   eraseFunctions['big-explosive'](fruits, 0, 0),
  // 'plus-explosive': (fruits: Fruits) =>
  //   eraseFunctions['big-explosive'](fruits, 0, 0),
};

export const useGameLogic = (
  fruits: Fruits,
  setFruits: React.Dispatch<React.SetStateAction<Fruits>>,
  setScore: React.Dispatch<React.SetStateAction<number>>
) => {
  const fruitsRef = useRef(fruits);
  fruitsRef.current = fruits;

  const checkMatches = useCallback(() => {
    return checkForMatches(fruitsRef.current, setFruits, setScore);
  }, [setFruits, setScore]);

  const moveIntoSquareBelow = useCallback(() => {
    const newFruits = [...fruitsRef.current];
    let fruitsMoved = false;

    for (let i = BOARD_SIZE * BOARD_SIZE - 1; i >= BOARD_SIZE; i--) {
      if (
        newFruits[i] === undefined &&
        newFruits[i - BOARD_SIZE] !== undefined
      ) {
        newFruits[i] = newFruits[i - BOARD_SIZE];
        newFruits[i - BOARD_SIZE] = undefined;
        fruitsMoved = true;
      }
    }

    for (let i = 0; i < BOARD_SIZE; i++) {
      if (newFruits[i] === undefined) {
        newFruits[i] = new Fruit();
        fruitsMoved = true;
      }
    }

    if (fruitsMoved) {
      setFruits(newFruits);
    }

    return fruitsMoved;
  }, [setFruits]);

  const handleSpecialFruits = useCallback(
    (draggedId: number, replacedId: number, fruits: Fruits) => {
      const draggedFruit = fruits[draggedId];
      const replacedFruit = fruits[replacedId];

      if (!draggedFruit || !replacedFruit) return fruits;

      let newFruits = [...fruits];
      let combinationFunction:
        | ((fruits: Fruits, color: FruitColor) => Fruits)
        | undefined;
      let normalFruit: Fruit | undefined;

      const combinationKey = `${draggedFruit.type}-${replacedFruit.type}`;
      const reverseCombinationKey = `${replacedFruit.type}-${draggedFruit.type}`;

      if (specialCombinations[combinationKey]) {
        combinationFunction = specialCombinations[combinationKey];
        normalFruit =
          replacedFruit.type === 'normal' ? replacedFruit : draggedFruit;
      } else if (specialCombinations[reverseCombinationKey]) {
        combinationFunction = specialCombinations[reverseCombinationKey];
        normalFruit =
          draggedFruit.type === 'normal' ? draggedFruit : replacedFruit;
      }

      if (combinationFunction) {
        // Handle the case where the normal fruit's color might be "null"
        const combinationColor =
          normalFruit?.color.name === 'null'
            ? draggedFruit.color.name === 'null'
              ? replacedFruit.color
              : draggedFruit.color
            : normalFruit?.color || draggedFruit.color;
        newFruits = combinationFunction(newFruits, combinationColor);

        // Apply the effect immediately for the new combinations
        // if (
        //   [
        //     'horizontal-horizontal',
        //     'vertical-vertical',
        //     'horizontal-vertical',
        //   ].includes(combinationKey) ||
        //   [
        //     'horizontal-horizontal',
        //     'vertical-vertical',
        //     'horizontal-vertical',
        //   ].includes(reverseCombinationKey)
        // ) {
        //   newFruits = eraseFunctions.plus(
        //     newFruits,
        //     Math.floor(draggedId / BOARD_SIZE),
        //     draggedId % BOARD_SIZE
        //   );
        // } else if (
        //   [
        //     'horizontal-explosive',
        //     'vertical-explosive',
        //     'plus-explosive',
        //   ].includes(combinationKey) ||
        //   [
        //     'horizontal-explosive',
        //     'vertical-explosive',
        //     'plus-explosive',
        //   ].includes(reverseCombinationKey)
        // ) {
        //   newFruits = eraseFunctions['big-explosive'](
        //     newFruits,
        //     Math.floor(draggedId / BOARD_SIZE),
        //     draggedId % BOARD_SIZE
        //   );
        // }
      } else {
        const specialFruit =
          draggedFruit.type !== 'normal' ? draggedFruit : replacedFruit;
        const specialFruitId =
          draggedFruit.type !== 'normal' ? draggedId : replacedId;

        // For special fruits that require a color (e.g., rainbow),
        // use the non-"null" color of either fruit
        const eraseColor =
          specialFruit.color.name === 'null'
            ? draggedFruit.color.name === 'null'
              ? replacedFruit.color
              : draggedFruit.color
            : specialFruit.color;

        const eraseFunction = eraseFunctions[specialFruit.type];
        newFruits = eraseFunction({
          fruits: newFruits,
          color: eraseColor,
          rowIndex: Math.floor(specialFruitId / BOARD_SIZE),
          colIndex: specialFruitId % BOARD_SIZE,
        });
      }

      // Count erased fruits and update score
      const erasedFruits = newFruits.filter(
        (fruit) => fruit === undefined
      ).length;
      setScore((score) => score + erasedFruits * PTS_PER_FRUIT);

      return newFruits;
    },
    [setScore]
  );

  return { checkMatches, moveIntoSquareBelow, handleSpecialFruits };
};
