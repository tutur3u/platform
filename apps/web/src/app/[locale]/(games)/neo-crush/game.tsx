// game.tsx
import { FruitGrid } from './fruit-grid';
import { FruitColor } from './types';
import { useGameLogic } from './use-game-logic';
import { createBoard } from './utils';
import { Button } from '@repo/ui/components/ui/button';
import { Card, CardContent } from '@repo/ui/components/ui/card';
import { Separator } from '@repo/ui/components/ui/separator';
import React, { useEffect, useState } from 'react';

export const NeoCrushGame: React.FC = () => {
  const [currentColorArrangement, setCurrentColorArrangement] = useState<
    FruitColor[]
  >([]);
  const [score, setScore] = useState<number>(0);

  const { checkMatches, moveIntoSquareBelow, handleSpecialFruits } =
    useGameLogic(currentColorArrangement, setCurrentColorArrangement, setScore);

  useEffect(() => {
    setCurrentColorArrangement(createBoard());
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      checkMatches();
      moveIntoSquareBelow();
      setCurrentColorArrangement([...currentColorArrangement]);
    }, 100);
    return () => clearInterval(timer);
  }, [checkMatches, moveIntoSquareBelow, currentColorArrangement]);

  return (
    <Card className="mx-auto">
      <CardContent>
        <FruitGrid
          currentColorArrangement={currentColorArrangement}
          setCurrentColorArrangement={setCurrentColorArrangement}
          handleSpecialFruits={handleSpecialFruits}
        />
        <p className="mt-4 text-center text-xl font-bold">Score: {score}</p>
        <Separator className="my-4" />
        <Button
          className="w-full"
          onClick={() => {
            setCurrentColorArrangement(createBoard());
            setScore(0);
          }}
        >
          Restart
        </Button>
      </CardContent>
    </Card>
  );
};
