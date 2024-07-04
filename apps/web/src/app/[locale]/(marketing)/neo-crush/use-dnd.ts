import { FruitColor, width } from './types';
import { checkForMatches } from './utils';
import { useCallback } from 'react';

export const useDragAndDrop = (
  currentColorArrangement: FruitColor[],
  setCurrentColorArrangement: React.Dispatch<
    React.SetStateAction<FruitColor[]>
  >,
  squareBeingDragged: HTMLDivElement | null,
  squareBeingReplaced: HTMLDivElement | null,
  setSquareBeingDragged: React.Dispatch<
    React.SetStateAction<HTMLDivElement | null>
  >,
  setSquareBeingReplaced: React.Dispatch<
    React.SetStateAction<HTMLDivElement | null>
  >
) => {
  const dragStart = (e: React.DragEvent<HTMLDivElement>) => {
    setSquareBeingDragged(e.target as HTMLDivElement);
    e.dataTransfer.effectAllowed = 'move';
  };

  const dragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const dragLeave = (_: React.DragEvent<HTMLDivElement>) => {
    // No action needed
  };

  const dragDrop = (e: React.DragEvent<HTMLDivElement>) => {
    setSquareBeingReplaced(e.target as HTMLDivElement);
  };

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

      if (validMove) {
        const draggedColor = squareBeingDragged.getAttribute(
          'data-color'
        ) as FruitColor;
        const replacedColor = squareBeingReplaced.getAttribute(
          'data-color'
        ) as FruitColor;

        currentColorArrangement[squareBeingReplacedId] = draggedColor;
        currentColorArrangement[squareBeingDraggedId] = replacedColor;

        const isAMatch = checkForMatches(currentColorArrangement);

        if (!isAMatch) {
          currentColorArrangement[squareBeingReplacedId] = replacedColor;
          currentColorArrangement[squareBeingDraggedId] = draggedColor;
        }
      } else {
        // Invalid move animation logic
      }

      setCurrentColorArrangement([...currentColorArrangement]);
      setSquareBeingDragged(null);
      setSquareBeingReplaced(null);
    },
    [
      squareBeingDragged,
      squareBeingReplaced,
      currentColorArrangement,
      setCurrentColorArrangement,
    ]
  );

  return { dragStart, dragOver, dragLeave, dragDrop, dragEnd };
};
