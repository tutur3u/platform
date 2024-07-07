// use-dnd.ts
import { BOARD_SIZE, Fruit, FruitColor, FruitType } from './types';
import { checkForMatches } from './utils';
import { useCallback } from 'react';

export const useDragAndDrop = (
  fruits: Fruit[],
  setFruits: React.Dispatch<React.SetStateAction<Fruit[]>>,
  squareBeingDragged: HTMLDivElement | null,
  squareBeingReplaced: HTMLDivElement | null,
  setSquareBeingDragged: React.Dispatch<
    React.SetStateAction<HTMLDivElement | null>
  >,
  setSquareBeingReplaced: React.Dispatch<
    React.SetStateAction<HTMLDivElement | null>
  >,
  handleSpecialFruits: (
    draggedId: number,
    replacedId: number,
    fruits: Fruit[]
  ) => Fruit[]
) => {
  const dragStart = (
    e: React.DragEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>
  ) => {
    const target = e.target as HTMLDivElement;
    setSquareBeingDragged(target);
    if (e.type === 'dragstart') {
      (e as React.DragEvent<HTMLDivElement>).dataTransfer.effectAllowed =
        'move';
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

      const squareBeingDraggedId = parseInt(
        squareBeingDragged.getAttribute('data-id') || '0'
      );
      const squareBeingReplacedId = parseInt(
        squareBeingReplaced.getAttribute('data-id') || '0'
      );

      const validMoves = [
        squareBeingDraggedId - 1,
        squareBeingDraggedId - BOARD_SIZE,
        squareBeingDraggedId + 1,
        squareBeingDraggedId + BOARD_SIZE,
      ];

      const validMove = validMoves.includes(squareBeingReplacedId);

      if (validMove) {
        const draggedFruit: Fruit = {
          color: squareBeingDragged.getAttribute('data-color') as FruitColor,
          type: squareBeingDragged.getAttribute('data-type') as FruitType,
        };

        const replacedFruit: Fruit = {
          color: squareBeingReplaced.getAttribute('data-color') as FruitColor,
          type: squareBeingReplaced.getAttribute('data-type') as FruitType,
        };

        fruits[squareBeingReplacedId] = draggedFruit;
        fruits[squareBeingDraggedId] = replacedFruit;

        fruits = handleSpecialFruits(
          squareBeingDraggedId,
          squareBeingReplacedId,
          fruits
        );

        const isAMatch = checkForMatches(fruits, setFruits);

        if (
          !isAMatch ||
          draggedFruit?.type !== 'normal' ||
          replacedFruit?.type !== 'normal'
        ) {
          fruits[squareBeingReplacedId] = undefined;
          fruits[squareBeingDraggedId] = undefined;
        }

        setFruits([...fruits]);
      }

      setSquareBeingDragged(null);
      setSquareBeingReplaced(null);
    },
    [
      squareBeingDragged,
      squareBeingReplaced,
      fruits,
      setFruits,
      handleSpecialFruits,
    ]
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
