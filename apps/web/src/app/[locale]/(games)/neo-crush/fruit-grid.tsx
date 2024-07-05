// fruit-grid.tsx
import { Fruit, colorMap } from './types';
import { useDragAndDrop } from './use-dnd';
import {
  Bomb,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Sparkles,
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
      <div className="mx-auto grid grid-cols-8 gap-1 md:gap-2 lg:gap-3">
        {fruits.map((fruit, index) => (
          <div
            key={index}
            className={`relative flex h-7 w-7 items-center justify-center rounded-full border-2 font-bold text-white shadow-md md:h-8 md:w-8 lg:h-10 lg:w-10 ${
              fruit
                ? fruit?.type !== 'normal'
                  ? ''
                  : 'border-transparent'
                : 'border-foreground/50'
            } ${
              fruit?.type === 'rainbow'
                ? 'bg-gradient-to-br from-red-600 via-violet-400 to-sky-400'
                : ''
            }`}
            style={{
              borderColor: fruit
                ? fruit?.type === 'rainbow'
                  ? 'var(--foreground)'
                  : fruit?.type !== 'normal'
                    ? colorMap[fruit.color]
                    : 'transparent'
                : 'var(--foreground)',
              opacity: fruit ? 1 : 0.3,
              backgroundColor:
                fruit?.type === 'rainbow'
                  ? undefined
                  : fruit
                    ? fruit?.type === 'normal'
                      ? colorMap[fruit.color]
                      : // colorMap gives hex color, we need to convert it to rgba
                        `rgba(${parseInt(
                          colorMap[fruit.color].slice(1, 3),
                          16
                        )}, ${parseInt(
                          colorMap[fruit.color].slice(3, 5),
                          16
                        )}, ${parseInt(
                          colorMap[fruit.color].slice(5, 7),
                          16
                        )}, 0.2)`
                    : 'transparent',
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
                <ChevronLeft
                  className="absolute -left-0.5 h-6 w-6"
                  style={{
                    animation: 'pulse 1s infinite',
                    color: colorMap[fruit.color],
                  }}
                />
                <ChevronRight
                  className="absolute -right-0.5 h-6 w-6"
                  style={{
                    animation: 'pulse 1s infinite',
                    color: colorMap[fruit.color],
                  }}
                />
              </>
            )}

            {fruit?.type === 'vertical' && (
              <>
                <ChevronUp
                  className="absolute -top-0.5 h-6 w-6"
                  style={{
                    animation: 'pulse 1s infinite',
                    color: colorMap[fruit.color],
                  }}
                />
                <ChevronDown
                  className="absolute -bottom-0.5 h-6 w-6"
                  style={{
                    animation: 'pulse 1s infinite',
                    color: colorMap[fruit.color],
                  }}
                />
              </>
            )}

            {fruit?.type === 'rainbow' && (
              <Sparkles className="text-foreground/70 absolute h-6 w-6" />
            )}

            {fruit?.type === 'explosive' && (
              <Bomb
                className="absolute h-6 w-6"
                style={{
                  animation: 'pulse 1s infinite',
                  color: colorMap[fruit.color],
                }}
              />
            )}
          </div>
        ))}
      </div>
    </>
  );
};
