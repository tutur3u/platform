import { FruitColor, colorMap } from './types';
import { useDragAndDrop } from './use-dnd';
import React, { useState } from 'react';

interface FruitGridProps {
  currentColorArrangement: FruitColor[];
  setCurrentColorArrangement: React.Dispatch<
    React.SetStateAction<FruitColor[]>
  >;
}

export const FruitGrid: React.FC<FruitGridProps> = ({
  currentColorArrangement,
  setCurrentColorArrangement,
}) => {
  const [squareBeingDragged, setSquareBeingDragged] =
    useState<HTMLDivElement | null>(null);
  const [squareBeingReplaced, setSquareBeingReplaced] =
    useState<HTMLDivElement | null>(null);

  const { dragStart, dragOver, dragLeave, dragDrop, dragEnd } = useDragAndDrop(
    currentColorArrangement,
    setCurrentColorArrangement,
    squareBeingDragged,
    squareBeingReplaced,
    setSquareBeingDragged,
    setSquareBeingReplaced
  );

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
        .fruit:hover {
          animation: pulse 0.5s infinite;
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
      `}</style>
      <div className="mx-auto mt-4 grid grid-cols-8 gap-2">
        {currentColorArrangement.map((fruitColor, index) => (
          <div
            key={index}
            className="fruit flex h-8 w-8 items-center justify-center rounded-full font-bold text-white shadow-md"
            style={{
              backgroundColor: fruitColor
                ? colorMap[fruitColor]
                : 'transparent',
              cursor: 'grab',
            }}
            data-id={index}
            data-color={fruitColor}
            draggable={true}
            onDragStart={dragStart}
            onDragOver={dragOver}
            onDragEnter={(e) => e.preventDefault()}
            onDragLeave={dragLeave}
            onDrop={dragDrop}
            onDragEnd={dragEnd}
          >
            {/* {fruitColor && fruitColor[0]?.toUpperCase()} */}
          </div>
        ))}
      </div>
    </>
  );
};
