// utils.ts
import {
  BOARD_SIZE,
  FRUIT_COLORS,
  Fruit,
  FruitColor,
  FruitType,
  PTS_PER_FRUIT,
} from './types';

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
  for (let i = 1; (startIndex % BOARD_SIZE) + i < BOARD_SIZE; i++) {
    if (fruits[startIndex + i]?.color === decidedColor) {
      horizontalMatch.push(startIndex + i);
    } else {
      break;
    }
  }
  for (let i = 1; (startIndex % BOARD_SIZE) - i >= 0; i++) {
    if (fruits[startIndex - i]?.color === decidedColor) {
      horizontalMatch.unshift(startIndex - i);
    } else {
      break;
    }
  }

  // Check vertical match
  for (let i = 1; startIndex + i * BOARD_SIZE < BOARD_SIZE * BOARD_SIZE; i++) {
    if (fruits[startIndex + i * BOARD_SIZE]?.color === decidedColor) {
      verticalMatch.push(startIndex + i * BOARD_SIZE);
    } else {
      break;
    }
  }
  for (let i = 1; startIndex - i * BOARD_SIZE >= 0; i++) {
    if (fruits[startIndex - i * BOARD_SIZE]?.color === decidedColor) {
      verticalMatch.unshift(startIndex - i * BOARD_SIZE);
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
  setScore?: React.Dispatch<React.SetStateAction<number>>,
  scoreUpdated?: boolean
) => {
  let hasMatch = false;
  const newFruits = [...fruits];
  const matchedIndices = new Set<number>();
  let poppedFruits = 0;

  for (let i = 0; i < newFruits.length; i++) {
    if (!matchedIndices.has(i)) {
      const match = findMatch(i, newFruits);
      if (match.length >= 3) {
        poppedFruits += match.length;

        // Add matched indices to the set to avoid double-counting
        match.forEach((index) => matchedIndices.add(index));

        // Clear matched fruits and create special fruits if needed
        if (match.length === 4) {
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

        hasMatch = true;
      }
    }
  }

  // Increment the score by 3 for each distinct match found
  if (poppedFruits > 0 && !scoreUpdated) {
    console.log(`${poppedFruits} matches found`);
    setScore?.((score) => score + poppedFruits * PTS_PER_FRUIT);
  }

  setFruits(newFruits);
  return hasMatch;
};

export const createBoard = (): Fruit[] => {
  const board = Array.from(
    { length: BOARD_SIZE * BOARD_SIZE },
    () => null
  ) as (Fruit | null)[];

  const isValidMove = (index: number, fruit?: Fruit | null) => {
    if (fruit?.type !== 'normal') return true;

    const x = index % BOARD_SIZE;
    const y = Math.floor(index / BOARD_SIZE);

    if (
      (x >= 2 &&
        board[index - 1]?.color === fruit?.color &&
        board[index - 2]?.color === fruit?.color) ||
      (y >= 2 &&
        board[index - BOARD_SIZE]?.color === fruit?.color &&
        board[index - 2 * BOARD_SIZE]?.color === fruit?.color)
    ) {
      return false;
    }

    return true;
  };

  const hasPossibleMove = () => {
    for (let i = 0; i < board.length; i++) {
      const fruit = board[i];
      const x = i % BOARD_SIZE;
      const y = Math.floor(i / BOARD_SIZE);

      if (
        (x < BOARD_SIZE - 1 &&
          board[i + 1] !== fruit &&
          isValidMove(i, board[i + 1])) ||
        (y < BOARD_SIZE - 1 &&
          board[i + BOARD_SIZE] !== fruit &&
          isValidMove(i, board[i + BOARD_SIZE])) ||
        (x > 0 && board[i - 1] !== fruit && isValidMove(i, board[i - 1])) ||
        (y > 0 &&
          board[i - BOARD_SIZE] !== fruit &&
          isValidMove(i, board[i - BOARD_SIZE]))
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
