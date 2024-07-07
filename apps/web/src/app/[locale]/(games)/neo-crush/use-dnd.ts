// use-dnd.ts
import { BOARD_SIZE, Fruit } from './types';
import { checkForMatches, handleSpecialFruits } from './utils';
import { useCallback } from 'react';

export const useDragAndDrop = (
  fruits: (Fruit | undefined)[],
  setFruits: React.Dispatch<React.SetStateAction<(Fruit | undefined)[]>>,
  setScore: React.Dispatch<React.SetStateAction<number>>,
  squareBeingDragged: HTMLDivElement | null,
  squareBeingReplaced: HTMLDivElement | null,
  setSquareBeingDragged: React.Dispatch<
    React.SetStateAction<HTMLDivElement | null>
  >,
  setSquareBeingReplaced: React.Dispatch<
    React.SetStateAction<HTMLDivElement | null>
  >
) => {
  const dragStart = (
    e: React.DragEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>
  ) => {
    const target = e.target as HTMLDivElement;
    setSquareBeingDragged(target);
    if (e.type === 'dragstart') {
      (e as React.DragEvent<HTMLDivElement>).dataTransfer.effectAllowed = 'move';
    }
  };

  const dragOver = (
    e: React.DragEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>
  ) => {
    e.preventDefault();
  };

  const dragLeave = (
    _: React.DragEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>
  ) => {
    // No action needed
  };

  const dragDrop = (
    e: React.DragEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>
  ) => {
    const target = e.target as HTMLDivElement;
    setSquareBeingReplaced(target);
  };

  const dragEnd = useCallback(
  (e: React.DragEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    target.style.opacity = '1';
    if (!squareBeingDragged || !squareBeingReplaced) return;

    const squareBeingDraggedId = parseInt(squareBeingDragged.getAttribute('data-id') || '0');
    const squareBeingReplacedId = parseInt(squareBeingReplaced.getAttribute('data-id') || '0');

    const validMoves = [
      squareBeingDraggedId - 1,
      squareBeingDraggedId - BOARD_SIZE,
      squareBeingDraggedId + 1,
      squareBeingDraggedId + BOARD_SIZE,
    ];

    const validMove = validMoves.includes(squareBeingReplacedId);

    // Async function to encapsulate logic that needs to wait
    const handleSwap = async () => {
      if (validMove) {
        const tempFruit = fruits[squareBeingReplacedId];
        fruits[squareBeingReplacedId] = fruits[squareBeingDraggedId];
        fruits[squareBeingDraggedId] = tempFruit;
        setFruits([...fruits]);

        // Wait for 100ms
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Call handleSpecialFruits before checking for matches
        const specialFruit = handleSpecialFruits(fruits, setFruits, setScore, squareBeingDraggedId, squareBeingReplacedId);
        if (specialFruit) return;

        const isAMatch = checkForMatches(fruits, setFruits, setScore);
        if (!isAMatch) {
          const tempFruit = fruits[squareBeingReplacedId];
          fruits[squareBeingReplacedId] = fruits[squareBeingDraggedId];
          fruits[squareBeingDraggedId] = tempFruit;
          setFruits([...fruits]);
        }
      }

      setSquareBeingDragged(null);
      setSquareBeingReplaced(null);
    };

    // Immediately invoke the async function
    const dragable = fruits.every((fruit) => fruit);
    if (dragable) handleSwap();
  },
  [fruits, squareBeingDragged, squareBeingReplaced]
);

  const touchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    dragStart(e);
  };

  const touchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    dragOver(e);
  };

  const touchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    dragDrop(e);
    dragEnd(e);
  };

  return {
    dragStart,
    dragOver,
    dragLeave,
    dragDrop,
    dragEnd,
    touchStart,
    touchMove,
    touchEnd,
  };
};
