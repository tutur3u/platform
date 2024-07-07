// game.tsx
import { FruitGrid } from './fruit-grid';
import GameStats from './game-stats';
import {
  summonExplosiveFruit,
  summonLineEraser,
  summonRainbowFruit,
} from './summoner';
import { Fruit } from './types';
import { useGameLogic } from './use-game-logic';
import { createBoard } from './utils';
import { Button } from '@repo/ui/components/ui/button';
import { Card } from '@repo/ui/components/ui/card';
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
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-8">
      <Card className="mx-auto p-2 md:p-4">
        <FruitGrid
          fruits={fruits}
          setFruits={setFruits}
          handleSpecialFruits={handleSpecialFruits}
        />
        <p className="mt-2 text-center text-sm font-bold md:mt-4 md:text-xl">
          Score: {score}
        </p>
        <Separator className="my-2 md:my-4" />
        <Button
          className="w-full"
          onClick={() => {
            setFruits(createBoard());
            setScore(0);
          }}
        >
          Restart
        </Button>
      </Card>

      <div className="bg-foreground/5 hidden gap-2 rounded-lg border p-4 md:grid">
        <div className="grid h-fit grid-cols-1 gap-2 xl:grid-cols-3">
          <Button
            className="w-full"
            variant="secondary"
            onClick={() => summonLineEraser({ fruits, setFruits })}
          >
            +1 Line Eraser
          </Button>
          <Button
            className="w-full"
            variant="secondary"
            onClick={() => summonRainbowFruit({ fruits, setFruits })}
          >
            +1 Rainbow Fruit
          </Button>
          <Button
            className="w-full"
            variant="secondary"
            onClick={() => summonExplosiveFruit({ fruits, setFruits })}
          >
            +1 Explosive Fruit
          </Button>
          <Separator className="col-span-full my-2" />
          <div className="col-span-full flex flex-col gap-2 text-center font-semibold">
            <div>Statistics</div>
            <div className="grid grid-cols-1 items-start gap-2 md:grid-cols-2">
              <GameStats fruits={fruits} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
