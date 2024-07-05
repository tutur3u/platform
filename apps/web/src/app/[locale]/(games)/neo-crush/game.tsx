// game.tsx
import { FruitGrid } from './fruit-grid';
import { Fruit } from './types';
import { useGameLogic } from './use-game-logic';
import { createBoard } from './utils';
import { Button } from '@repo/ui/components/ui/button';
import { Card, CardContent } from '@repo/ui/components/ui/card';
import { Separator } from '@repo/ui/components/ui/separator';
import React, { useEffect, useState } from 'react';

export const NeoCrushGame: React.FC = () => {
  const [fruits, setFruits] = useState<Fruit[]>([]);
  const [score, setScore] = useState<number>(0);

  const { checkMatches, moveIntoSquareBelow, handleSpecialFruits } =
    useGameLogic(fruits, setFruits, setScore);

  useEffect(() => {
    setFruits(createBoard());
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      checkMatches();
      moveIntoSquareBelow();
    }, 100);
    return () => clearInterval(timer);
  }, [checkMatches, moveIntoSquareBelow]);

  return (
    <Card className="mx-auto">
      <CardContent>
        <FruitGrid
          fruits={fruits}
          setFruits={setFruits}
          handleSpecialFruits={handleSpecialFruits}
        />
        <p className="mt-4 text-center text-xl font-bold">Score: {score}</p>
        <Separator className="my-4" />
        <Button
          className="w-full"
          onClick={() => {
            setFruits(createBoard());
            setScore(0);
          }}
        >
          Restart
        </Button>
      </CardContent>
    </Card>
  );
};
