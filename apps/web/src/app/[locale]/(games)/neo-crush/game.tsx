// game.tsx
import { FruitGrid } from './fruit-grid';
import FruitPlaceholder from './fruit-placeholder';
import GameStats from './game-stats';
import {
  summonExplosiveFruit,
  summonLineEraser,
  summonRainbowFruit,
} from './summoner';
import { DEFAULT_TURNS, Fruit, Fruits } from './types';
import { useGameLogic } from './use-game-logic';
import { createBoard } from './utils';
import { DEV_MODE } from '@/constants/common';
import { Button } from '@ncthub/ui/button';
import { Card } from '@ncthub/ui/card';
import { Separator } from '@ncthub/ui/separator';
import { cn } from '@ncthub/utils/format';
import React, { useEffect, useMemo, useState } from 'react';

export const NeoCrushGame: React.FC = () => {
  const [fruits, setFruits] = useState<Fruits>(createBoard());
  const [score, setScore] = useState<number>(0);

  const [unlimitedTurns, setUnlimitedTurns] = useState(false);
  const [turns, setTurns] = useState<number>(DEFAULT_TURNS);

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
    <div className="grid grid-cols-1 gap-2 font-mono md:grid-cols-2 md:gap-4">
      <Card className="w-full p-2 md:p-4">
        <div className={cn(turns <= 0 ? 'opacity-50' : '', 'relative')}>
          {turns === 0 && !unlimitedTurns && (
            <div className="bg-foreground/20 absolute inset-0 flex items-center justify-center rounded-lg text-5xl font-semibold text-white">
              GAME OVER
            </div>
          )}
          <FruitGrid
            fruits={fruits}
            setFruits={setFruits}
            setScore={setScore}
            handleSpecialFruits={handleSpecialFruits}
            decrementTurns={() =>
              unlimitedTurns ? () => {} : setTurns((prev) => prev - 1)
            }
            disabled={turns <= 0 && !unlimitedTurns}
          />
        </div>
        <div className="mt-2 flex w-full items-center justify-center gap-4 text-center text-sm font-bold md:mt-4">
          <div className="w-full">
            <span className="opacity-70">Turns:</span>{' '}
            <span className="md:text-xl lg:text-base">
              {unlimitedTurns ? '∞' : turns.toString().padStart(2, '0')}
            </span>
          </div>
          <Separator orientation="vertical" className="h-4" />
          <div className="w-full">
            <span className="opacity-70">Score:</span>{' '}
            <span className="md:text-xl lg:text-base">{score}</span>
          </div>
        </div>

        <Separator className="my-2 md:my-4" />
        <div className="grid grid-cols-2 gap-2">
          <Button
            className="w-full font-semibold"
            onClick={() => {
              setFruits(createBoard());
              setUnlimitedTurns(false);
              setTurns(DEFAULT_TURNS);
              setScore(0);
            }}
            variant="destructive"
          >
            Restart
          </Button>
          <Button
            className="flex w-full flex-wrap gap-1 font-semibold"
            onClick={() => {
              setUnlimitedTurns((prev) => !prev);
              setTurns(DEFAULT_TURNS);
            }}
            disabled={turns !== DEFAULT_TURNS || unlimitedTurns}
            variant="secondary"
          >
            <span className="opacity-70">UNLIMITED:</span>
            {unlimitedTurns ? (
              <span className="text-dynamic-green">ON</span>
            ) : (
              <span className="text-dynamic-red">OFF</span>
            )}
          </Button>
        </div>
      </Card>

      <div className="bg-foreground/5 hidden gap-2 rounded-lg border p-4 font-mono md:grid">
        <div className="grid h-fit grid-cols-1 gap-2 md:grid-cols-3">
          {DEV_MODE && (
            <>
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
                  summonExplosiveFruit({
                    type: 'big-explosive',
                    fruits,
                    setFruits,
                  })
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
            </>
          )}
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
