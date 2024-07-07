// game.tsx
import { FruitGrid } from './fruit-grid';
import FruitPlaceholder from './fruit-placeholder';
import GameStats from './game-stats';
import {
  summonExplosiveFruit,
  summonLineEraser,
  summonRainbowFruit,
} from './summoner';
import { Fruit, Fruits } from './types';
import { useGameLogic } from './use-game-logic';
import { createBoard } from './utils';
import { Button } from '@repo/ui/components/ui/button';
import { Card } from '@repo/ui/components/ui/card';
import { Separator } from '@repo/ui/components/ui/separator';
import React, { useEffect, useMemo, useState } from 'react';

export const NeoCrushGame: React.FC = () => {
  const [fruits, setFruits] = useState<Fruits>(createBoard());
  const [score, setScore] = useState<number>(0);

  const { checkMatches, moveIntoSquareBelow, handleSpecialFruits } =
    useGameLogic(fruits, setFruits, setScore);

  useEffect(() => {
    setFruits(createBoard());
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const dragable = fruits.every((fruit) => fruit);
      if (dragable) checkMatches();
      moveIntoSquareBelow();
    }, 150);
    return () => clearInterval(timer);
  }, [fruits, checkMatches, moveIntoSquareBelow]);

  const presetFruits = useMemo(
    () => ({
      horizontal: new Fruit('null', 'horizontal'),
      vertical: new Fruit('null', 'vertical'),
      plus: new Fruit('null', 'plus'),
      explosive: new Fruit('null', 'explosive'),
      'big-explosive': new Fruit('null', 'big-explosive'),
      rainbow: new Fruit('null', 'rainbow'),
    }),
    []
  );

  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-4">
      <Card className="w-full p-2 md:p-4">
        <FruitGrid
          fruits={fruits}
          setFruits={setFruits}
          setScore={setScore}
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

      <div className="bg-foreground/5 hidden gap-2 rounded-lg border p-4 font-mono md:grid">
        <div className="grid h-fit grid-cols-1 gap-2 md:grid-cols-3">
          <Button
            className="flex w-full items-center gap-1"
            variant="secondary"
            onClick={() =>
              summonLineEraser({ type: 'horizontal', fruits, setFruits })
            }
          >
            +1
            <FruitPlaceholder
              fruit={presetFruits.horizontal}
              className="h-4 w-4 md:h-6 md:w-6 lg:h-6 lg:w-6"
              iconClassName="md:w-4 md:h-4"
            />
          </Button>
          <Button
            className="flex w-full items-center gap-1"
            variant="secondary"
            onClick={() =>
              summonLineEraser({ type: 'vertical', fruits, setFruits })
            }
          >
            +1
            <FruitPlaceholder
              fruit={presetFruits.vertical}
              className="h-4 w-4 md:h-6 md:w-6 lg:h-6 lg:w-6"
              iconClassName="md:w-4 md:h-4"
            />
          </Button>
          <Button
            className="flex w-full items-center gap-1"
            variant="secondary"
            onClick={() =>
              summonLineEraser({ type: 'plus', fruits, setFruits })
            }
          >
            +1
            <FruitPlaceholder
              fruit={presetFruits.plus}
              className="h-4 w-4 md:h-6 md:w-6 lg:h-6 lg:w-6"
              iconClassName="md:w-3 md:h-3"
            />
          </Button>
          <Button
            className="flex w-full items-center gap-1"
            variant="secondary"
            onClick={() =>
              summonExplosiveFruit({ type: 'explosive', fruits, setFruits })
            }
          >
            +1
            <FruitPlaceholder
              fruit={presetFruits.explosive}
              className="h-4 w-4 md:h-6 md:w-6 lg:h-6 lg:w-6"
              iconClassName="md:w-3 md:h-3"
            />
          </Button>
          <Button
            className="flex w-full items-center gap-1"
            variant="secondary"
            onClick={() =>
              summonExplosiveFruit({ type: 'big-explosive', fruits, setFruits })
            }
          >
            +1
            <FruitPlaceholder
              fruit={presetFruits['big-explosive']}
              className="h-4 w-4 md:h-6 md:w-6 lg:h-6 lg:w-6"
              iconClassName="md:w-3 md:h-3"
            />
          </Button>
          <Button
            className="flex w-full items-center gap-1"
            variant="secondary"
            onClick={() => summonRainbowFruit({ fruits, setFruits })}
          >
            +1
            <FruitPlaceholder
              fruit={presetFruits.rainbow}
              className="h-4 w-4 md:h-6 md:w-6 lg:h-6 lg:w-6"
              iconClassName="md:w-4 md:h-4"
            />
          </Button>
          <Separator className="col-span-full my-2" />
          <div className="col-span-full flex flex-col gap-2 text-center font-semibold">
            <div>Statistics</div>
            <Separator className="col-span-full my-2" />
            <div className="flex items-start justify-center gap-2 text-sm lg:text-base">
              <GameStats fruits={fruits} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
