// fruit-grid.tsx
import FruitPlaceholder from './fruit-placeholder';
import { Fruits } from './types';
import { useDragAndDrop } from './use-dnd';
import React, { useRef, useState } from 'react';

interface FruitGridProps {
  fruits: Fruits;
  setFruits: React.Dispatch<React.SetStateAction<Fruits>>;
  setScore: React.Dispatch<React.SetStateAction<number>>;
  handleSpecialFruits: (
    draggedId: number,
    replacedId: number,
    fruits: Fruits
  ) => Fruits;
}

export const FruitGrid: React.FC<FruitGridProps> = ({
  fruits,
  setFruits,
  setScore,
  handleSpecialFruits,
}) => {
  const [squareBeingDragged, setSquareBeingDragged] =
    useState<HTMLDivElement | null>(null);
  const [squareBeingReplaced, setSquareBeingReplaced] =
    useState<HTMLDivElement | null>(null);
  const touchStartPosition = useRef<{ x: number; y: number } | null>(null);

  const { dragStart, dragOver, dragLeave, dragDrop, dragEnd } = useDragAndDrop(
    fruits,
    setFruits,
    setScore,
    squareBeingDragged,
    squareBeingReplaced,
    setSquareBeingDragged,
    setSquareBeingReplaced,
    handleSpecialFruits
  );

  const touchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    const touch = e.touches[0];
    if (!touch) return;
    touchStartPosition.current = { x: touch.clientX, y: touch.clientY };
    dragStart(e);
  };

  const touchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!touchStartPosition.current) return;

    const touch = e.touches[0];
    if (!touch) return;

    const diffX = touch.clientX - touchStartPosition.current.x;
    const diffY = touch.clientY - touchStartPosition.current.y;

    // Only process as a swipe if the movement is significant
    if (Math.abs(diffX) > 20 || Math.abs(diffY) > 20) {
      const target = e.target as HTMLDivElement;
      const currentId = parseInt(target.getAttribute('data-id') || '0');

      let newId;
      if (Math.abs(diffX) > Math.abs(diffY)) {
        // Horizontal swipe
        newId = currentId + (diffX > 0 ? 1 : -1);
      } else {
        // Vertical swipe
        newId = currentId + (diffY > 0 ? 8 : -8); // Assuming 8 columns
      }

      const newTarget = document.querySelector(
        `[data-id="${newId}"]`
      ) as HTMLDivElement;
      if (newTarget) {
        setSquareBeingReplaced(newTarget);
        dragDrop({
          target: newTarget,
        } as unknown as React.DragEvent<HTMLDivElement>);
      }
    }
  };

  const touchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    dragDrop(e);
    dragEnd(e);
  };

  return (
    <>
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
        @keyframes special-pulse {
          0% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.2);
            opacity: 0.7;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
      <div className="mx-auto grid w-fit grid-cols-7 gap-2 lg:gap-3">
        {fruits.map((fruit, index) => (
          <FruitPlaceholder
            key={index}
            data-id={index}
            fruit={fruit}
            data-color={fruit?.color?.name}
            data-type={fruit?.type}
            draggable={true}
            onDragStart={dragStart}
            onDragOver={dragOver}
            onDragLeave={dragLeave}
            onDrop={dragDrop}
            onDragEnd={dragEnd}
            onTouchStart={touchStart}
            onTouchMove={touchMove}
            onTouchEnd={touchEnd}
          />
        ))}
      </div>
    </>
  );
};
