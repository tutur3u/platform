import { FruitColor, FruitColors, width } from './types';

export const findMatch = (
  startIndex: number,
  currentColorArrangement: FruitColor[]
): number[] => {
  const decidedColor = currentColorArrangement[startIndex];
  let horizontalMatch: number[] = [startIndex];
  let verticalMatch: number[] = [startIndex];

  // Check horizontal match
  for (let i = 1; (startIndex % width) + i < width; i++) {
    if (currentColorArrangement[startIndex + i] === decidedColor) {
      horizontalMatch.push(startIndex + i);
    } else {
      break;
    }
  }
  for (let i = 1; (startIndex % width) - i >= 0; i++) {
    if (currentColorArrangement[startIndex - i] === decidedColor) {
      horizontalMatch.unshift(startIndex - i);
    } else {
      break;
    }
  }

  // Check vertical match
  for (let i = 1; startIndex + i * width < width * width; i++) {
    if (currentColorArrangement[startIndex + i * width] === decidedColor) {
      verticalMatch.push(startIndex + i * width);
    } else {
      break;
    }
  }
  for (let i = 1; startIndex - i * width >= 0; i++) {
    if (currentColorArrangement[startIndex - i * width] === decidedColor) {
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
  currentColorArrangement: FruitColor[],
  setScore?: React.Dispatch<React.SetStateAction<number>>
) => {
  let hasMatch = false;
  let totalMatchLength = 0;
  const checkedIndexes = new Set<number>();

  for (let i = 0; i < currentColorArrangement.length; i++) {
    if (!checkedIndexes.has(i)) {
      const match = findMatch(i, currentColorArrangement);
      if (match.length >= 3) {
        totalMatchLength += match.length;
        match.forEach((square) => {
          currentColorArrangement[square] = undefined!;
          checkedIndexes.add(square);
        });
        hasMatch = true;
      }
    }
  }

  if (totalMatchLength > 0) {
    setScore?.((score) => score + totalMatchLength);
  }

  return hasMatch;
};

export const createBoard = (): FruitColor[] => {
  const board = Array.from(
    { length: width * width },
    () => null
  ) as (FruitColor | null)[];

  const isValidMove = (index: number, color?: FruitColor | null) => {
    const x = index % width;
    const y = Math.floor(index / width);
    if (
      (x >= 2 && board[index - 1] === color && board[index - 2] === color) ||
      (y >= 2 &&
        board[index - width] === color &&
        board[index - 2 * width] === color)
    ) {
      return false;
    }
    return true;
  };

  const hasPossibleMove = () => {
    for (let i = 0; i < board.length; i++) {
      const color = board[i];
      const x = i % width;
      const y = Math.floor(i / width);
      if (
        (x < width - 1 &&
          board[i + 1] !== color &&
          isValidMove(i, board[i + 1])) ||
        (y < width - 1 &&
          board[i + width] !== color &&
          isValidMove(i, board[i + width])) ||
        (x > 0 && board[i - 1] !== color && isValidMove(i, board[i - 1])) ||
        (y > 0 &&
          board[i - width] !== color &&
          isValidMove(i, board[i - width]))
      ) {
        return true;
      }
    }
    return false;
  };

  // Fill the board
  for (let i = 0; i < board.length; i++) {
    let color;
    do {
      color = FruitColors[Math.floor(Math.random() * FruitColors.length)];
    } while (!isValidMove(i, color));
    board[i] = color as FruitColor;
  }

  // Ensure at least one possible move exists
  while (!hasPossibleMove()) {
    for (let i = 0; i < board.length; i++) {
      let color;
      do {
        color = FruitColors[Math.floor(Math.random() * FruitColors.length)];
      } while (!isValidMove(i, color));
      board[i] = color as FruitColor;
    }
  }

  return board as FruitColor[];
};
