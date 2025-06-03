import { FruitColorName, FruitType, Fruits } from './types';
import { Separator } from '@ncthub/ui/separator';
import { cn } from '@ncthub/utils/format';

export default function GameStats({ fruits }: { fruits: Fruits }) {
  const fruitTypeCounts: {
    empty: number;
    normal: number;
    plus: number;
    horizontal: number;
    vertical: number;
    explosive: number;
    'big-explosive': number;
    rainbow: number;
  } = fruits.reduce(
    (acc, fruit) => {
      if (fruit) acc[fruit.type] = (acc[fruit.type] || 0) + 1;
      else acc.empty += 1;

      return acc;
    },
    {
      empty: 0,
      normal: 0,
      horizontal: 0,
      vertical: 0,
      plus: 0,
      explosive: 0,
      'big-explosive': 0,
      rainbow: 0,
    } as Record<FruitType | 'empty', number>
  );

  const fruitColorCounts = fruits.reduce(
    (acc, fruit) => {
      if (fruit) acc[fruit.color] = (acc[fruit.color] || 0) + 1;

      return acc;
    },
    {
      red: 0,
      yellow: 0,
      green: 0,
      // blue: 0,
      purple: 0,
      orange: 0,
    } as Record<FruitColorName, number>
  );

  return (
    <>
      <div className="w-full text-right">
        {Object.entries(fruitTypeCounts)
          // .sort(([k1], [k2]) => k1.localeCompare(k2))
          .map(([key, count]) => (
            <div
              key={key}
              className={cn(
                key === 'empty' && 'opacity-50',
                key === 'plus' && 'text-dynamic-yellow',
                key === 'horizontal' && 'text-dynamic-blue',
                key === 'vertical' && 'text-dynamic-green',
                key === 'explosive' && 'text-dynamic-red',
                key === 'big-explosive' && 'text-dynamic-purple',
                key === 'rainbow' &&
                  'bg-gradient-to-r from-pink-500 via-yellow-500 to-sky-600 bg-clip-text py-1 text-transparent dark:from-pink-300 dark:via-amber-300 dark:to-blue-300'
              )}
            >
              <span>{key}</span>:{' '}
              <span
                className={cn(
                  key === 'rainbow' && 'text-foreground',
                  'text-xs opacity-30'
                )}
              >
                x
              </span>
              <span
                className={cn(
                  key === 'rainbow' && 'text-foreground',
                  count === 0 ? 'opacity-80' : ''
                )}
              >
                {count.toString().padStart(2, '0')}
              </span>
            </div>
          ))}
      </div>

      <Separator className="mx-4" orientation="vertical" />

      <div className="w-full text-right">
        {Object.entries(fruitColorCounts)
          // .sort(([k1], [k2]) => k1.localeCompare(k2))
          .map(([key, count]) => (
            <div
              key={key}
              className={cn(
                key === 'red' && 'text-dynamic-red',
                key === 'yellow' && 'text-dynamic-yellow',
                key === 'green' && 'text-dynamic-green',
                key === 'blue' && 'text-dynamic-blue',
                key === 'purple' && 'text-dynamic-purple',
                key === 'pink' && 'text-dynamic-pink',
                key === 'orange' && 'text-dynamic-orange',
                key === 'null' && 'opacity-50'
              )}
            >
              <span>{key}</span>: <span className="text-xs opacity-50">x</span>
              <span className={count === 0 ? 'opacity-80' : ''}>
                {count.toString().padStart(2, '0')}
              </span>
            </div>
          ))}
      </div>
    </>
  );
}
