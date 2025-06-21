import { BOARD_SIZE, Fruit, FruitColorName, FruitType, Fruits } from './types';
import { checkForMatches } from './utils';
import { useCallback } from 'react';

export const useDragAndDrop = (
  fruits: Fruits,
  setFruits: React.Dispatch<React.SetStateAction<Fruits>>,
  setScore: React.Dispatch<React.SetStateAction<number>>,
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
    fruits: Fruits
  ) => Fruits,
  decrementTurns: () => void,
  disabled: boolean
) => {
  const dragStart = (
    e: React.DragEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>
  ) => {
    if (disabled) return;
    const target = e.target as HTMLDivElement;
    setSquareBeingDragged(target);
    if (e.type === 'dragstart' && !disabled) {
      (e as React.DragEvent<HTMLDivElement>).dataTransfer.effectAllowed =
        'move';
    }
  };

  const dragOver = (
    e: React.DragEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>
  ) => {
    e.preventDefault();
    if (disabled) return;
  };

  const dragLeave = (
    _: React.DragEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>
  ) => {
    if (disabled) return;
    // No action needed
  };

  const dragDrop = (
    e: React.DragEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>
  ) => {
    if (disabled) return;
    const target = e.target as HTMLDivElement;
    setSquareBeingReplaced(target);
  };

  const dragEnd = useCallback(
    (e: React.DragEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
      if (disabled) return;
      if (fruits.some((fruit) => !fruit)) return;

      const target = e.target as HTMLDivElement;
      target.style.opacity = '1';

      if (!squareBeingDragged || !squareBeingReplaced) {
        console.error('Missing dragged or replaced square');
        return;
      }

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

      const handleSwap = async () => {
        if (validMove) {
          const draggedFruit = new Fruit(
            squareBeingDragged.getAttribute('data-color') as FruitColorName,
            squareBeingDragged.getAttribute('data-type') as FruitType
          );

          const replacedFruit = new Fruit(
            squareBeingReplaced.getAttribute('data-color') as FruitColorName,
            squareBeingReplaced.getAttribute('data-type') as FruitType
          );

          fruits[squareBeingDraggedId] = replacedFruit;
          fruits[squareBeingReplacedId] = draggedFruit;

          const newFruits = handleSpecialFruits(
            squareBeingDraggedId,
            squareBeingReplacedId,
            fruits
          );

          const hasMatch = checkForMatches(
            newFruits,
            setFruits,
            setScore,
            squareBeingDraggedId,
            squareBeingReplacedId
          );

          if (
            !hasMatch &&
            draggedFruit?.type === 'normal' &&
            replacedFruit?.type === 'normal'
          ) {
            const temp = newFruits[squareBeingDraggedId];
            newFruits[squareBeingDraggedId] = newFruits[squareBeingReplacedId];
            newFruits[squareBeingReplacedId] = temp;
          }

          if (
            hasMatch ||
            draggedFruit?.type !== 'normal' ||
            replacedFruit?.type !== 'normal'
          )
            decrementTurns();
          setFruits(newFruits);
        }

        setSquareBeingDragged(null);
        setSquareBeingReplaced(null);
      };

      const dragable = fruits.every((fruit) => fruit);
      if (dragable && !disabled) handleSwap();
    },
    [
      fruits,
      squareBeingDragged,
      squareBeingReplaced,
      handleSpecialFruits,
      setFruits,
      setScore,
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
