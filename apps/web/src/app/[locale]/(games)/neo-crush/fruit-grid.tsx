// fruit-grid.tsx
import { Fruit, colorMap } from './types';
import { useDragAndDrop } from './use-dnd';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
} from 'lucide-react';
import React, { useRef, useState } from 'react';

interface FruitGridProps {
  fruits: Fruit[];
  setFruits: React.Dispatch<React.SetStateAction<Fruit[]>>;
  handleSpecialFruits: (draggedId: number, replacedId: number) => void;
}

export const FruitGrid: React.FC<FruitGridProps> = ({
  fruits,
  setFruits,
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
        .fruit {
          transition: all 0.3s ease;
          user-select: none;
        }
        .fruit.invalid-swap {
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
      <div className="mx-auto grid grid-cols-8 gap-2">
        {fruits.map((fruit, index) => (
          <div
            key={index}
            className={`fruit relative flex h-8 w-8 items-center justify-center rounded-full font-bold text-white shadow-md ${
              fruit?.type === 'horizontal' || fruit?.type === 'vertical'
                ? 'border-foreground border-2'
                : ''
            }`}
            style={{
              backgroundColor: fruit ? colorMap[fruit.color] : 'transparent',
              cursor: 'grab',
              backgroundSize: 'auto',
            }}
            data-id={index}
            data-color={fruit?.color as string | undefined}
            data-type={fruit?.type as string | undefined}
            draggable={true}
            onDragStart={dragStart}
            onDragOver={dragOver}
            onDragEnter={(e) => e.preventDefault()}
            onDragLeave={dragLeave}
            onDrop={dragDrop}
            onDragEnd={dragEnd}
            onTouchStart={touchStart}
            onTouchMove={touchMove}
            onTouchEnd={touchEnd}
          >
            {fruit?.type === 'horizontal' && (
              <>
                <ChevronLeft className="absolute -left-1 h-6 w-6" />
                <ChevronRight className="absolute -right-1 h-6 w-6" />
              </>
            )}

            {fruit?.type === 'vertical' && (
              <>
                <ChevronUp className="absolute -top-1 h-6 w-6" />
                <ChevronDown className="absolute -bottom-1 h-6 w-6" />
              </>
            )}
          </div>
        ))}
      </div>
    </>
  );
};
