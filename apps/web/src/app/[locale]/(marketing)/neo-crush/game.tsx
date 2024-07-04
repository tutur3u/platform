import { Card, CardContent } from '@repo/ui/components/ui/card';
import React, { useCallback, useEffect, useState } from 'react';

// Constants for board dimensions and candy colors
const width = 8;
const candyColors = [
  'red',
  'blue',
  'green',
  'yellow',
  'purple',
  'orange',
] as const;
type CandyColor = (typeof candyColors)[number];

// Color map for styling the candies
const colorMap: Record<CandyColor, string> = {
  red: '#FF6B6B',
  blue: '#4ECDC4',
  green: '#45B7D1',
  yellow: '#FED766',
  purple: '#6A0572',
  orange: '#F17F29',
};

/**
 * Candy Crush Clone Component
 */
export const NeoCrushGame: React.FC = () => {
  // State to store the arrangement of candy colors on the board
  const [currentColorArrangement, setCurrentColorArrangement] = useState<
    CandyColor[]
  >([]);

  // States to track drag and drop operations
  const [squareBeingDragged, setSquareBeingDragged] =
    useState<HTMLDivElement | null>(null);
  const [squareBeingReplaced, setSquareBeingReplaced] =
    useState<HTMLDivElement | null>(null);

  // State to store the current score
  const [score, setScore] = useState<number>(0);

  /**
   * Finds all candies involved in a match, both horizontally and vertically.
   * @param startIndex - The index of the candy to start checking from.
   * @returns An array of indexes representing the candies in the match.
   *          Returns an empty array if no match is found.
   */
  const findMatch = (startIndex: number): number[] => {
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

    // Return the longer match if it's at least 3 candies long
    if (
      horizontalMatch.length >= 3 &&
      horizontalMatch.length >= verticalMatch.length
    ) {
      return horizontalMatch;
    } else if (verticalMatch.length >= 3) {
      return verticalMatch;
    }

    return []; // No valid match found
  };

  /**
   * Checks for matches on the entire board and updates the score.
   * @returns True if a match was found, false otherwise.
   */
  const checkForMatches = useCallback(() => {
    let hasMatch = false;
    let totalMatchLength = 0; // Accumulate total matches length
    const checkedIndexes = new Set<number>();

    for (let i = 0; i < currentColorArrangement.length; i++) {
      if (!checkedIndexes.has(i)) {
        const match = findMatch(i);
        if (match.length >= 3) {
          totalMatchLength += match.length; // Add to total matches length
          match.forEach((square) => {
            currentColorArrangement[square] = undefined!;
            checkedIndexes.add(square);
          });
          hasMatch = true;
        }
      }
    }

    if (totalMatchLength > 0) {
      setScore((score) => score + totalMatchLength); // Update score exactly once
    }

    return hasMatch;
  }, [currentColorArrangement]);

  /**
   * Moves candies down to fill empty spaces on the board.
   */
  const moveIntoSquareBelow = useCallback(() => {
    for (let i = 0; i <= 55; i++) {
      const isFirstRow = i >= 0 && i <= 7; // Optimized first row check

      if (isFirstRow && currentColorArrangement[i] === undefined) {
        currentColorArrangement[i] =
          candyColors[Math.floor(Math.random() * candyColors.length)]!;
      }

      if (currentColorArrangement[i + width] === undefined) {
        currentColorArrangement[i + width] = currentColorArrangement[i]!;
        currentColorArrangement[i] = undefined!;
      }
    }
  }, [currentColorArrangement]);

  // Drag and drop event handlers
  const dragStart = (e: React.DragEvent<HTMLDivElement>) => {
    setSquareBeingDragged(e.target as HTMLDivElement);
    e.dataTransfer.effectAllowed = 'move';
    // Optimize: No need to set drag image for this animation style
  };

  const dragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); // Necessary to allow drop
  };

  const dragLeave = (_: React.DragEvent<HTMLDivElement>) => {
    // No action needed here for this implementation
  };

  const dragDrop = (e: React.DragEvent<HTMLDivElement>) => {
    setSquareBeingReplaced(e.target as HTMLDivElement);
  };

  /**
   * Handles the end of a drag operation, swapping candies if the move is valid.
   * @param e - The drag end event object.
   */
  const dragEnd = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      (e.target as HTMLDivElement).style.opacity = '1';
      if (!squareBeingDragged || !squareBeingReplaced) return;

      const squareBeingDraggedId = parseInt(
        squareBeingDragged.getAttribute('data-id') || '0'
      );
      const squareBeingReplacedId = parseInt(
        squareBeingReplaced.getAttribute('data-id') || '0'
      );

      const validMoves = [
        squareBeingDraggedId - 1,
        squareBeingDraggedId - width,
        squareBeingDraggedId + 1,
        squareBeingDraggedId + width,
      ];

      const validMove = validMoves.includes(squareBeingReplacedId);

      // Declare draggedElement and replacedElement outside setTimeout
      let draggedElement: HTMLElement | null = null;
      let replacedElement: HTMLElement | null = null;

      if (validMove) {
        // Valid Move: Swap colors in data structure
        const draggedColor = squareBeingDragged.getAttribute(
          'data-color'
        ) as CandyColor;
        const replacedColor = squareBeingReplaced.getAttribute(
          'data-color'
        ) as CandyColor;

        currentColorArrangement[squareBeingReplacedId] = draggedColor;
        currentColorArrangement[squareBeingDraggedId] = replacedColor;

        // Check for matches after the swap
        const isAMatch = checkForMatches();

        if (!isAMatch) {
          // Revert the swap if no match is found
          currentColorArrangement[squareBeingReplacedId] = replacedColor;
          currentColorArrangement[squareBeingDraggedId] = draggedColor;
        }
      } else {
        // Invalid Move Animation:

        // 1. Swap the elements visually
        const draggedColor = squareBeingDragged.getAttribute(
          'data-color'
        ) as CandyColor;
        const replacedColor = squareBeingReplaced.getAttribute(
          'data-color'
        ) as CandyColor;

        currentColorArrangement[squareBeingReplacedId] = draggedColor;
        currentColorArrangement[squareBeingDraggedId] = replacedColor;
        setCurrentColorArrangement([...currentColorArrangement]);

        // 2. Apply animation after a short delay (to allow visual swap)
        setTimeout(() => {
          // Now, get references to the DOM elements using their data-id attributes
          draggedElement = document.querySelector(
            `[data-id="${squareBeingDraggedId}"]`
          ) as HTMLElement;
          replacedElement = document.querySelector(
            `[data-id="${squareBeingReplacedId}"]`
          ) as HTMLElement;

          // Apply the 'shake' animation to the elements
          if (draggedElement) {
            draggedElement.style.animation = 'shake 0.5s ease-in-out';
          }
          if (replacedElement) {
            // Add a slight delay to the second element for a staggered effect
            replacedElement.style.animation = 'shake 0.5s ease-in-out 0.1s';
          }
        }, 50); // Adjust delay (ms) as needed

        // 3. Revert the visual swap and clear the animation
        setTimeout(() => {
          currentColorArrangement[squareBeingReplacedId] = replacedColor;
          currentColorArrangement[squareBeingDraggedId] = draggedColor;
          setCurrentColorArrangement([...currentColorArrangement]);

          // Clear the animation styles to prevent conflicts with future animations
          if (draggedElement) {
            draggedElement.style.animation = '';
          }
          if (replacedElement) {
            replacedElement.style.animation = '';
          }
        }, 550); // Total animation duration: 550ms (adjust as needed)
      }

      // Reset drag and drop states
      setCurrentColorArrangement([...currentColorArrangement]);
      setSquareBeingDragged(null);
      setSquareBeingReplaced(null);
    },
    [
      squareBeingDragged,
      squareBeingReplaced,
      currentColorArrangement,
      checkForMatches,
    ]
  );

  /**
   * Initializes the game board with a random arrangement of candies.
   */
  const createBoard = () => {
    const board = Array.from(
      { length: width * width },
      () => null
    ) as (CandyColor | null)[]; // Initialize the board with null values

    const isValidMove = (index: number, color?: CandyColor | null) => {
      const x = index % width;
      const y = Math.floor(index / width);
      // Check horizontally and vertically to avoid pre-determined explosions
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
        // Check for a possible move by looking at adjacent candies
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
        color = candyColors[Math.floor(Math.random() * candyColors.length)];
      } while (!isValidMove(i, color));
      board[i] = color as CandyColor;
    }

    // Ensure at least one possible move exists
    while (!hasPossibleMove()) {
      for (let i = 0; i < board.length; i++) {
        let color;
        do {
          color = candyColors[Math.floor(Math.random() * candyColors.length)];
        } while (!isValidMove(i, color));
        board[i] = color as CandyColor;
      }
    }

    setCurrentColorArrangement(board as CandyColor[]);
  };

  // Initialize the board when the component mounts
  useEffect(() => {
    createBoard();
  }, []);

  // Game loop to check for matches and move candies
  useEffect(() => {
    const timer = setInterval(() => {
      checkForMatches();
      moveIntoSquareBelow();
      setCurrentColorArrangement([...currentColorArrangement]);
    }, 100);
    return () => clearInterval(timer);
  }, [checkForMatches, moveIntoSquareBelow, currentColorArrangement]);

  return (
    <Card className="mx-auto w-96">
      <CardContent>
        <style jsx>{`
          @keyframes pulse {
            0% {
              transform: scale(1);
            }
            50% {
              transform: scale(1.05);
            }
            100% {
              transform: scale(1);
            }
          }

          .candy {
            transition: all 0.3s ease;
            user-select: none;
          }

          .candy:hover {
            animation: pulse 0.5s infinite;
          }

          .candy.invalid-swap {
            animation: shake 0.5s ease-in-out;
          }

          @keyframes shake {
            0% {
              transform: translateX(0);
            }
            25% {
              transform: translateX(-5px);
            }
            50% {
              transform: translateX(5px);
            }
            75% {
              transform: translateX(-5px);
            }
            100% {
              transform: translateX(0);
            }
          }
        `}</style>

        <div className="mx-auto mt-4 grid grid-cols-8 gap-2">
          {currentColorArrangement.map((candyColor, index) => (
            <div
              key={index} // Important: Each key should be unique!
              className="candy flex h-8 w-8 items-center justify-center rounded-full font-bold text-white shadow-md"
              style={{
                backgroundColor: candyColor
                  ? colorMap[candyColor]
                  : 'transparent',
                cursor: 'grab',
              }}
              data-id={index}
              data-color={candyColor}
              draggable={true}
              onDragStart={dragStart}
              onDragOver={dragOver}
              onDragEnter={(e) => e.preventDefault()} // Necessary for drop
              onDragLeave={dragLeave}
              onDrop={dragDrop}
              onDragEnd={dragEnd}
            >
              {candyColor && candyColor[0]?.toUpperCase()}
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-xl font-bold">Score: {score}</p>
      </CardContent>
    </Card>
  );
};
