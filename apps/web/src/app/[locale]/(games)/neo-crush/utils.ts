// utils.ts
import {
  BOARD_SIZE,
  PTS_PER_FRUIT,
  Fruit
} from './types';

export const createFruitFromColor = (color: string) => new Fruit(color);

export const createRandomFruit = () => new Fruit();

export const findMatch = (startIndex: number, fruits: (Fruit | undefined)[]): number[] => {
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
  fruits: (Fruit | undefined)[],
  setFruits: React.Dispatch<React.SetStateAction<(Fruit | undefined)[]>>,
  setScore: React.Dispatch<React.SetStateAction<number>>
) => {
  let hasMatch = false;
  let poppedFruits = 0;
  
  for (let i = 0; i < fruits.length; i++) {
    const allFilled = fruits.every((fruit) => fruit);
    if (allFilled) {
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
            if (index !== centerIndex && newFruits[square]?.type === 'normal') {
              fruits[square] = undefined;
            }
          });
        } else {
          match.forEach((square) => {
            fruits[square] = undefined;
          });
        }
        hasMatch = true;
      }
    }
  }

  // Increment the score by 3 for each distinct match found
  if (poppedFruits > 0) {
    setScore(score => score + poppedFruits * PTS_PER_FRUIT);
  }

  setFruits([...fruits]);
  return hasMatch;
};

export const handleSpecialFruits = (
  fruits: (Fruit | undefined)[],
  setFruits: React.Dispatch<React.SetStateAction<(Fruit | undefined)[]>>,
  setScore: React.Dispatch<React.SetStateAction<number>>,
  draggedId: number, 
  replacedId: number
) => {
  let specialFruit = false;
  const draggedFruit = fruits[draggedId];
  const replacedFruit = fruits[replacedId];

  if (draggedFruit?.type === 'horizontal' || replacedFruit?.type === 'horizontal') {
    const lineEraserIndex = draggedFruit?.type === 'horizontal' ? draggedId : replacedId;
    const row = Math.floor(lineEraserIndex / BOARD_SIZE);

    // Erase the entire row
    for (let i = 0; i < BOARD_SIZE; i++) {
      fruits[row * BOARD_SIZE + i] = undefined;
    }
    setScore(score => score + BOARD_SIZE * PTS_PER_FRUIT);
    
    // Update the fruits state
    setFruits([...fruits]);
    specialFruit = true;
  }
  else if (draggedFruit?.type === 'vertical' || replacedFruit?.type === 'vertical') {
    const lineEraserIndex = draggedFruit?.type === 'vertical' ? draggedId : replacedId;
    const col = lineEraserIndex % BOARD_SIZE;

    // Erase the entire column
    for (let i = 0; i < BOARD_SIZE; i++) {
      fruits[i * BOARD_SIZE + col] = undefined;
    }
    setScore(score => score + BOARD_SIZE * PTS_PER_FRUIT);
    
    // Update the fruits state
    setFruits([...fruits]);
    specialFruit = true;
  }
  else if (draggedFruit?.type === 'explosive' || replacedFruit?.type === 'explosive') {
    const explosiveIndex = draggedFruit?.type === 'explosive' ? draggedId : replacedId;
    const row = Math.floor(explosiveIndex / BOARD_SIZE);
    const col = explosiveIndex % BOARD_SIZE;

    // Erase the 3x3 square centered around the explosive fruit
    for (let i = row - 1; i <= row + 1; i++) {
      for (let j = col - 1; j <= col + 1; j++) {
        if (i >= 0 && i < BOARD_SIZE && j >= 0 && j < BOARD_SIZE) {
          fruits[i * BOARD_SIZE + j] = undefined;
        }
      }
    }
    setScore(score => score + 9 * PTS_PER_FRUIT);

    // Update the fruits state
    setFruits([...fruits]);
    specialFruit = true;
  }
  else if (draggedFruit?.type === 'rainbow' || replacedFruit?.type === 'rainbow') {
    const rainbowIndex = draggedFruit?.type === 'rainbow' ? draggedId : replacedId;
    fruits[rainbowIndex] = undefined;

    // Update the fruits state
    setFruits([...fruits]);
    specialFruit = true;
  }
  return specialFruit;
};

export const createBoard = (): (Fruit | undefined)[] => {
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

  return board as (Fruit | undefined)[];
};
