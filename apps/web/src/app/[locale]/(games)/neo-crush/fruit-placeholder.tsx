import {
  Bomb,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  LoaderPinwheel,
  Sparkle,
} from '@ncthub/ui/icons';
import { cn } from '@ncthub/utils/format';
import Image from 'next/image';
import { type Fruit, getColorCode, getColorSrc } from './types';

function FruitPlaceholder({
  fruit,
  className,
  iconClassName,
  ...props
}: {
  fruit: Fruit | undefined;
  className?: string;
  iconClassName?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'relative flex h-9 w-9 items-center justify-center rounded-full border-2 bg-foreground/10 font-bold text-white shadow-md sm:h-12 sm:w-12 md:h-14 md:w-14 lg:h-16 lg:w-16',
        fruit
          ? fruit?.type !== 'normal'
            ? ''
            : 'border-transparent'
          : 'border-foreground/50',
        fruit?.type === 'rainbow'
          ? 'bg-linear-to-br from-red-600 via-violet-400 to-sky-400'
          : '',
        className
      )}
      style={{
        borderColor: fruit
          ? fruit?.type === 'rainbow'
            ? 'var(--foreground)'
            : fruit?.type !== 'normal'
              ? getColorCode(fruit?.color)
              : 'transparent'
          : 'var(--foreground)',
        opacity: fruit ? 1 : 0.3,
        backgroundColor:
          fruit?.color && getColorSrc(fruit?.color)
            ? undefined
            : fruit?.type === 'rainbow'
              ? undefined
              : fruit
                ? fruit?.type === 'normal'
                  ? getColorCode(fruit?.color)
                  : // colorMap gives hex color, we need to convert it to rgba
                    `rgba(
                  ${parseInt(getColorCode(fruit?.color).slice(1, 3) as string, 16)},
                  ${parseInt(getColorCode(fruit?.color).slice(3, 5) as string, 16)},
                  ${parseInt(getColorCode(fruit?.color).slice(5, 7) as string, 16)},
                0.2)`
                : 'transparent',
        cursor: 'grab',
        backgroundSize: 'auto',
      }}
      {...props}
    >
      {fruit?.color && getColorSrc(fruit?.color) && (
        <Image
          src={getColorSrc(fruit?.color)!}
          alt={fruit?.color}
          width={1400}
          height={1400}
          className="pointer-events-none h-9 w-9 object-contain sm:h-12 sm:w-12 md:h-14 md:w-14 lg:h-16 lg:w-16"
          priority
        />
      )}

      {(fruit?.type === 'horizontal' || fruit?.type === 'plus') && (
        <>
          <ChevronLeft
            className={cn(
              'pointer-events-none absolute -left-0.5',
              fruit?.type === 'plus'
                ? 'h-3 w-3 sm:h-4 sm:w-4 md:h-5 md:w-5'
                : 'h-4 w-4 sm:h-6 sm:w-6 md:h-8 md:w-8',
              iconClassName
            )}
            style={{
              animation: 'pulse 1s infinite',
              color: getColorCode(fruit?.color),
            }}
          />
          <ChevronRight
            className={cn(
              'pointer-events-none absolute -right-0.5',
              fruit?.type === 'plus'
                ? 'h-3 w-3 sm:h-4 sm:w-4 md:h-5 md:w-5'
                : 'h-4 w-4 sm:h-6 sm:w-6 md:h-8 md:w-8',
              iconClassName
            )}
            style={{
              animation: 'pulse 1s infinite',
              color: getColorCode(fruit?.color),
            }}
          />
        </>
      )}

      {(fruit?.type === 'vertical' || fruit?.type === 'plus') && (
        <>
          <ChevronUp
            className={cn(
              'pointer-events-none absolute -top-0.5',
              fruit?.type === 'plus'
                ? 'h-3 w-3 sm:h-4 sm:w-4 md:h-5 md:w-5'
                : 'h-4 w-4 sm:h-6 sm:w-6 md:h-8 md:w-8',
              iconClassName
            )}
            style={{
              animation: 'pulse 1s infinite',
              color: getColorCode(fruit?.color),
            }}
          />
          <ChevronDown
            className={cn(
              'pointer-events-none absolute -bottom-0.5',
              fruit?.type === 'plus'
                ? 'h-3 w-3 sm:h-4 sm:w-4 md:h-5 md:w-5'
                : 'h-4 w-4 sm:h-6 sm:w-6 md:h-8 md:w-8',
              iconClassName
            )}
            style={{
              animation: 'pulse 1s infinite',
              color: getColorCode(fruit?.color),
            }}
          />
        </>
      )}

      {fruit?.type === 'explosive' && (
        <Bomb
          className={cn(
            'pointer-events-none absolute h-4 w-4 sm:h-6 sm:w-6 md:h-8 md:w-8',
            iconClassName
          )}
          style={{
            animation: 'pulse 1s infinite',
            color: getColorCode(fruit?.color),
          }}
        />
      )}

      {fruit?.type === 'big-explosive' && (
        <Sparkle
          className={cn(
            'pointer-events-none absolute h-4 w-4 sm:h-6 sm:w-6 md:h-8 md:w-8',
            iconClassName
          )}
          style={{
            animation: 'pulse 1s infinite',
            color: getColorCode(fruit?.color),
          }}
        />
      )}

      {fruit?.type === 'rainbow' && (
        <LoaderPinwheel
          className={cn(
            'pointer-events-none absolute h-5 w-5 animate-spin text-foreground/70 sm:h-7 sm:w-7 md:h-8 md:w-8',
            iconClassName
          )}
        />
      )}
    </div>
  );
}

export default FruitPlaceholder;
