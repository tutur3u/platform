// utils.ts
import { BOARD_SIZE, Fruit, Fruits, PTS_PER_FRUIT } from './types';

export const findMatch = (startIndex: number, fruits: Fruits): number[] => {
  const decidedColor = fruits[startIndex]?.color;

  let horizontalMatch: number[] = [startIndex];
  let verticalMatch: number[] = [startIndex];

  // Check horizontal match
  for (let i = 1; (startIndex % BOARD_SIZE) + i < BOARD_SIZE; i++) {
    if (
      fruits[startIndex + i]?.color === decidedColor &&
      fruits[startIndex + i]?.type === 'normal'
    ) {
      horizontalMatch.push(startIndex + i);
    } else {
      break;
    }
  }

  for (let i = 1; (startIndex % BOARD_SIZE) - i >= 0; i++) {
    if (
      fruits[startIndex - i]?.color === decidedColor &&
      fruits[startIndex - i]?.type === 'normal'
    ) {
      horizontalMatch.unshift(startIndex - i);
    } else {
      break;
    }
  }

  // Check vertical match
  for (let i = 1; startIndex + i * BOARD_SIZE < BOARD_SIZE * BOARD_SIZE; i++) {
    if (
      fruits[startIndex + i * BOARD_SIZE]?.color === decidedColor &&
      fruits[startIndex + i * BOARD_SIZE]?.type === 'normal'
    ) {
      verticalMatch.push(startIndex + i * BOARD_SIZE);
    } else {
      break;
    }
  }

  for (let i = 1; startIndex - i * BOARD_SIZE >= 0; i++) {
    if (
      fruits[startIndex - i * BOARD_SIZE]?.color === decidedColor &&
      fruits[startIndex - i * BOARD_SIZE]?.type === 'normal'
    ) {
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
  fruits: Fruits,
  setFruits: React.Dispatch<React.SetStateAction<Fruits>>,
  setScore: React.Dispatch<React.SetStateAction<number>>
) => {
  let hasMatch = false;
  let poppedFruits = 0;

  for (let i = 0; i < fruits.length; i++) {
    const allFilled = fruits.every((fruit) => fruit);
    if (!allFilled) break;

    const match = findMatch(i, fruits);
    if (match.length >= 3) {
      poppedFruits += match.length;

      // Clear matched fruits and create special fruits if needed
      if (match.length === 4) {
        const centerIndex = Math.floor(match.length / 2);
        const isHorizontal = Math.random() < 0.5;
        if (fruits[match[centerIndex]!]?.type)
          fruits[match[centerIndex]!]!.type = isHorizontal
            ? 'horizontal'
            : 'vertical';
        match.forEach((square, index) => {
          if (index !== centerIndex && fruits[square]?.type === 'normal') {
            fruits[square] = undefined;
          }
        });
      } else {
        match.forEach((square) => {
          if (fruits[square]?.type === 'normal') fruits[square] = undefined;
        });
      }
      hasMatch = true;
    }
  }

  if (poppedFruits > 0 && setScore) {
    setScore((score) => score + poppedFruits * PTS_PER_FRUIT);
  }

  if (setFruits) setFruits([...fruits]);
  return hasMatch;
};

export const createBoard = (): Fruits => {
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
    let fruit: Fruit;

    do {
      fruit = new Fruit();
    } while (!isValidMove(i, fruit));

    board[i] = fruit;
  }

  // Ensure at least one possible move exists
  while (!hasPossibleMove()) {
    for (let i = 0; i < board.length; i++) {
      let fruit: Fruit;

      do {
        fruit = new Fruit();
      } while (!isValidMove(i, fruit));

      board[i] = fruit;
    }
  }

  return board as Fruits;
};
