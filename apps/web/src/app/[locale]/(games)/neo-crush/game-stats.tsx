import { Fruit } from './types';
import { cn } from '@/lib/utils';

export default function GameStats({ fruits }: { fruits: Fruit[] }) {
  const fruitTypeCounts: {
    empty: number;
    normal: number;
    horizontal: number;
    vertical: number;
    explosive: number;
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
      explosive: 0,
      rainbow: 0,
    }
  );

  const fruitColorCounts = fruits.reduce(
    (acc, fruit) => {
      if (fruit) acc[fruit.color] = (acc[fruit.color] || 0) + 1;

      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <>
      <div>
        {Object.entries(fruitTypeCounts).map(([key, count]) => (
          <div key={key}>
            <span
              className={cn(
                key === 'empty' && 'opacity-50',
                key === 'horizontal' && 'text-dynamic-blue',
                key === 'vertical' && 'text-dynamic-green',
                key === 'explosive' && 'text-dynamic-red',
                key === 'rainbow' &&
                  'bg-gradient-to-r from-pink-500 via-yellow-500 to-sky-600 bg-clip-text py-1 text-transparent dark:from-pink-300 dark:via-amber-300 dark:to-blue-300'
              )}
            >
              {key}
            </span>
            : <span className="opacity-30">x</span>
            <span className={count === 0 ? 'opacity-50' : ''}>{count}</span>
          </div>
        ))}
      </div>

      <div>
        {Object.entries(fruitColorCounts).map(([key, count]) => (
          <div key={key}>
            <span
              className={cn(
                key === 'red' && 'text-dynamic-red',
                key === 'yellow' && 'text-dynamic-yellow',
                key === 'green' && 'text-dynamic-green',
                key === 'blue' && 'text-dynamic-blue',
                key === 'purple' && 'text-dynamic-purple',
                key === 'orange' && 'text-dynamic-orange'
              )}
            >
              {key}
            </span>
            : <span className="opacity-30">x</span>
            <span className={count === 0 ? 'opacity-50' : ''}>{count}</span>
          </div>
        ))}
      </div>
    </>
  );
}
