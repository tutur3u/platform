import { FruitColor, colorMap } from './types';
import { useDragAndDrop } from './use-dnd';
import React, { useState } from 'react';

interface FruitGridProps {
  currentColorArrangement: FruitColor[];
  setCurrentColorArrangement: React.Dispatch<
    React.SetStateAction<FruitColor[]>
  >;
  handleSpecialFruits: (draggedId: number, replacedId: number) => void;
}

export const FruitGrid: React.FC<FruitGridProps> = ({
  currentColorArrangement,
  setCurrentColorArrangement,
  handleSpecialFruits,
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
    setSquareBeingReplaced,
    handleSpecialFruits
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
        .fruit.line-eraser::before {
          content: '✖';
          font-size: 20px;
          color: black;
          border: 2px solid white;
          border-radius: 9999px;
          animation: special-pulse 2s infinite;
        }
        .fruit:not(.line-eraser):hover {
          animation: pulse 1s infinite;
        }
      `}</style>
      <div className="mx-auto mt-4 grid grid-cols-8 gap-2">
        {currentColorArrangement.map((fruitColor, index) => (
          <div
            key={index}
            className={`fruit flex h-8 w-8 items-center justify-center rounded-full font-bold text-white shadow-md ${
              fruitColor === 'lineEraser' ? 'line-eraser' : ''
            }`}
            style={{
              backgroundColor: fruitColor
                ? colorMap[fruitColor]
                : 'transparent',
              cursor: 'grab',
              backgroundSize: 'auto',
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
