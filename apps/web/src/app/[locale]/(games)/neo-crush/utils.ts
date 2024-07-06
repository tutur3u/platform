// utils.ts
import { FRUIT_COLORS, Fruit, FruitColor, FruitType, width } from './types';

export const createFruitFromColor = (color: FruitColor): Fruit => ({
  color,
  type: 'normal',
});

export const createRandomFruit = ({
  type = 'normal',
}: {
  type?: FruitType;
} = {}): Fruit => {
  const color = FRUIT_COLORS[
    Math.floor(Math.random() * FRUIT_COLORS.length)
  ] as FruitColor;
  return { color, type };
};

export const findMatch = (startIndex: number, fruits: Fruit[]): number[] => {
  const decidedColor = fruits[startIndex]?.color;

  let horizontalMatch: number[] = [startIndex];
  let verticalMatch: number[] = [startIndex];

  // Check horizontal match
  for (let i = 1; (startIndex % width) + i < width; i++) {
    if (fruits[startIndex + i]?.color === decidedColor) {
      horizontalMatch.push(startIndex + i);
    } else {
      break;
    }
  }
  for (let i = 1; (startIndex % width) - i >= 0; i++) {
    if (fruits[startIndex - i]?.color === decidedColor) {
      horizontalMatch.unshift(startIndex - i);
    } else {
      break;
    }
  }

  // Check vertical match
  for (let i = 1; startIndex + i * width < width * width; i++) {
    if (fruits[startIndex + i * width]?.color === decidedColor) {
      verticalMatch.push(startIndex + i * width);
    } else {
      break;
    }
  }
  for (let i = 1; startIndex - i * width >= 0; i++) {
    if (fruits[startIndex - i * width]?.color === decidedColor) {
      verticalMatch.unshift(startIndex - i * width);
    } else {
      break;
    }
  }

  if (
    horizontalMatch.length >= 3 &&
    horizontalMatch.length >= verticalMatch.length
  ) {
    return horizontalMatch;
  } else if (verticalMatch.length >= 3) {
    return verticalMatch;
  }

  return [];
};

export const checkForMatches = (
  fruits: Fruit[],
  setFruits: React.Dispatch<React.SetStateAction<Fruit[]>>,
  setScore?: React.Dispatch<React.SetStateAction<number>>
) => {
  let hasMatch = false;
  let totalMatchLength = 0;

  const checkedIndexes = new Set<number>();
  const newFruits = [...fruits];

  for (let i = 0; i < newFruits.length; i++) {
    if (!checkedIndexes.has(i)) {
      const match = findMatch(i, newFruits);
      if (match.length >= 3) {
        totalMatchLength += match.length;

        // Create special fruits
        if (match.length === 4) {
          // Place the special fruit at the center of the match
          const centerIndex = Math.floor(match.length / 2);
          const isHorizontal = Math.random() < 0.5;

          if (newFruits[match[centerIndex]!]?.type)
            newFruits[match[centerIndex]!]!.type = isHorizontal
              ? 'horizontal'
              : 'vertical';

          match.forEach((square, index) => {
            if (index !== centerIndex) {
              newFruits[square] = undefined;
            }
          });
        } else {
          match.forEach((square) => {
            newFruits[square] = undefined;
          });
        }

        match.forEach((square) => {
          checkedIndexes.add(square);
        });
        hasMatch = true;
      }
    }
  }

  if (totalMatchLength > 0) {
    setScore?.((score) => score + totalMatchLength);
  }

  setFruits(newFruits);
  return hasMatch;
};

export const createBoard = (): Fruit[] => {
  const board = Array.from(
    { length: width * width },
    () => null
  ) as (Fruit | null)[];

  const isValidMove = (index: number, fruit?: Fruit | null) => {
    if (fruit?.type !== 'normal') return true;

    const x = index % width;
    const y = Math.floor(index / width);

    if (
      (x >= 2 &&
        board[index - 1]?.color === fruit?.color &&
        board[index - 2]?.color === fruit?.color) ||
      (y >= 2 &&
        board[index - width]?.color === fruit?.color &&
        board[index - 2 * width]?.color === fruit?.color)
    ) {
      return false;
    }

    return true;
  };

  const hasPossibleMove = () => {
    for (let i = 0; i < board.length; i++) {
      const fruit = board[i];
      const x = i % width;
      const y = Math.floor(i / width);

      if (
        (x < width - 1 &&
          board[i + 1] !== fruit &&
          isValidMove(i, board[i + 1])) ||
        (y < width - 1 &&
          board[i + width] !== fruit &&
          isValidMove(i, board[i + width])) ||
        (x > 0 && board[i - 1] !== fruit && isValidMove(i, board[i - 1])) ||
        (y > 0 &&
          board[i - width] !== fruit &&
          isValidMove(i, board[i - width]))
      ) {
        return true;
      }
    }

    return false;
  };

  // Fill the board with available colors
  for (let i = 0; i < board.length; i++) {
    let fruit: Fruit | null;

    do {
      fruit = {
        color: FRUIT_COLORS[Math.floor(Math.random() * FRUIT_COLORS.length)]!,
        type: 'normal',
      };
    } while (!isValidMove(i, fruit));

    board[i] = fruit;
  }

  // Ensure at least one possible move exists
  while (!hasPossibleMove()) {
    for (let i = 0; i < board.length; i++) {
      let fruit: Fruit | null;

      do {
        fruit = {
          color: FRUIT_COLORS[Math.floor(Math.random() * FRUIT_COLORS.length)]!,
          type: 'normal',
        };
      } while (!isValidMove(i, fruit));

      board[i] = fruit;
    }
  }

  return board as Fruit[];
};
