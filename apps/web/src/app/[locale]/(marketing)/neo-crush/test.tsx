'use client';

import { Card, CardContent } from '@repo/ui/components/ui/card';
import React, { useCallback, useEffect, useState } from 'react';

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

const colorMap: Record<CandyColor, string> = {
  red: '#FF6B6B',
  blue: '#4ECDC4',
  green: '#45B7D1',
  yellow: '#FED766',
  purple: '#6A0572',
  orange: '#F17F29',
};

const CandyCrushClone: React.FC = () => {
  const [currentColorArrangement, setCurrentColorArrangement] = useState<
    CandyColor[]
  >([]);
  const [squareBeingDragged, setSquareBeingDragged] =
    useState<HTMLDivElement | null>(null);
  const [squareBeingReplaced, setSquareBeingReplaced] =
    useState<HTMLDivElement | null>(null);
  const [score, setScore] = useState<number>(0);

  const checkForColumnOfThree = useCallback(() => {
    for (let i = 0; i <= 47; i++) {
      const columnOfThree = [i, i + width, i + width * 2];
      const decidedColor = currentColorArrangement[i];

      if (
        columnOfThree.every(
          (square) => currentColorArrangement[square] === decidedColor
        )
      ) {
        setScore((score) => score + 3);
        columnOfThree.forEach(
          (square) => (currentColorArrangement[square] = undefined!)
        );
        return true;
      }
    }
  }, [currentColorArrangement]);

  const checkForRowOfThree = useCallback(() => {
    for (let i = 0; i < 64; i++) {
      const rowOfThree = [i, i + 1, i + 2];
      const decidedColor = currentColorArrangement[i];
      const notValid = [
        6, 7, 14, 15, 22, 23, 30, 31, 38, 39, 46, 47, 54, 55, 63, 64,
      ];

      if (notValid.includes(i)) continue;

      if (
        rowOfThree.every(
          (square) => currentColorArrangement[square] === decidedColor
        )
      ) {
        setScore((score) => score + 3);
        rowOfThree.forEach(
          (square) => (currentColorArrangement[square] = undefined!)
        );
        return true;
      }
    }
  }, [currentColorArrangement]);

  const moveIntoSquareBelow = useCallback(() => {
    for (let i = 0; i <= 55; i++) {
      const firstRow = [0, 1, 2, 3, 4, 5, 6, 7];
      const isFirstRow = firstRow.includes(i);

      if (isFirstRow && currentColorArrangement[i] === undefined) {
        let randomNumber = Math.floor(Math.random() * candyColors.length);
        currentColorArrangement[i] = candyColors[randomNumber]!;
      }

      if (currentColorArrangement[i + width] === undefined) {
        currentColorArrangement[i + width] = currentColorArrangement[i]!;
        currentColorArrangement[i] = undefined!;
      }
    }
  }, [currentColorArrangement]);

  const dragStart = (e: React.DragEvent<HTMLDivElement>) => {
    setSquareBeingDragged(e.target as HTMLDivElement);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setDragImage(new Image(), 0, 0);
    (e.target as HTMLDivElement).style.opacity = '0.5';
  };

  const dragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.style.transform = 'scale(1.1)';
  };

  const dragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.currentTarget.style.transform = 'scale(1)';
  };

  const dragDrop = (e: React.DragEvent<HTMLDivElement>) => {
    setSquareBeingReplaced(e.target as HTMLDivElement);
    e.currentTarget.style.transform = 'scale(1)';
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

      if (!validMove) return;

      const draggedColor = squareBeingDragged.getAttribute(
        'data-color'
      ) as CandyColor;
      const replacedColor = squareBeingReplaced.getAttribute(
        'data-color'
      ) as CandyColor;

      currentColorArrangement[squareBeingReplacedId] = draggedColor;
      currentColorArrangement[squareBeingDraggedId] = replacedColor;

      const isAColumnOfThree = checkForColumnOfThree();
      const isARowOfThree = checkForRowOfThree();

      if (isARowOfThree || isAColumnOfThree) {
        setSquareBeingDragged(null);
        setSquareBeingReplaced(null);
      } else {
        currentColorArrangement[squareBeingReplacedId] = replacedColor;
        currentColorArrangement[squareBeingDraggedId] = draggedColor;
      }

      setCurrentColorArrangement([...currentColorArrangement]);
    },
    [
      squareBeingDragged,
      squareBeingReplaced,
      currentColorArrangement,
      checkForColumnOfThree,
      checkForRowOfThree,
    ]
  );

  const createBoard = () => {
    const randomColorArrangement = Array.from(
      { length: width * width },
      () => candyColors[Math.floor(Math.random() * candyColors.length)]
    );
    setCurrentColorArrangement(randomColorArrangement as CandyColor[]);
  };

  useEffect(() => {
    createBoard();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      checkForColumnOfThree();
      checkForRowOfThree();
      moveIntoSquareBelow();
      setCurrentColorArrangement([...currentColorArrangement]);
    }, 100);
    return () => clearInterval(timer);
  }, [
    checkForColumnOfThree,
    checkForRowOfThree,
    moveIntoSquareBelow,
    currentColorArrangement,
  ]);

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
            -webkit-user-drag: none;
          }
          .candy:hover {
            animation: pulse 0.5s infinite;
          }
          .candy:active {
            cursor: grabbing;
          }
          [draggable] {
            -webkit-user-drag: element;
          }
        `}</style>
        <div className="mx-auto mt-4 grid grid-cols-8 gap-2">
          {currentColorArrangement.map((candyColor, index) => (
            <div
              key={index}
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
              onDragEnter={(e) => e.preventDefault()}
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

export default CandyCrushClone;
