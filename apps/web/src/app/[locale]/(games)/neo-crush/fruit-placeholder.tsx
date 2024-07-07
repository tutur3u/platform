import { Fruit } from './types';
import { cn } from '@/lib/utils';
import {
  Bomb,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  LoaderPinwheel,
  Sparkle,
} from 'lucide-react';

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
        'relative flex h-7 w-7 items-center justify-center rounded-full border-2 font-bold text-white shadow-md md:h-8 md:w-8 lg:h-10 lg:w-10',
        fruit
          ? fruit?.type !== 'normal'
            ? ''
            : 'border-transparent'
          : 'border-foreground/50',
        fruit?.type === 'rainbow'
          ? 'bg-gradient-to-br from-red-600 via-violet-400 to-sky-400'
          : '',
        className
      )}
      style={{
        borderColor: fruit
          ? fruit?.type === 'rainbow'
            ? 'var(--foreground)'
            : fruit?.type !== 'normal'
              ? fruit?.color?.code
              : 'transparent'
          : 'var(--foreground)',
        opacity: fruit ? 1 : 0.3,
        backgroundColor:
          fruit?.type === 'rainbow'
            ? undefined
            : fruit
              ? fruit?.type === 'normal'
                ? fruit?.color?.code
                : // colorMap gives hex color, we need to convert it to rgba
                  `rgba(
                  ${parseInt(fruit?.color?.code.slice(1, 3) as string, 16)},
                  ${parseInt(fruit?.color?.code.slice(3, 5) as string, 16)},
                  ${parseInt(fruit?.color?.code.slice(5, 7) as string, 16)},
                0.2)`
              : 'transparent',
        cursor: 'grab',
        backgroundSize: 'auto',
      }}
      {...props}
    >
      {(fruit?.type === 'horizontal' || fruit?.type === 'plus') && (
        <>
          <ChevronLeft
            className={cn(
              'pointer-events-none absolute -left-0.5',
              fruit?.type === 'plus'
                ? 'h-3 w-3 md:h-4 md:w-4'
                : 'h-5 w-5 md:h-6 md:w-6',
              iconClassName
            )}
            style={{
              animation: 'pulse 1s infinite',
              color: fruit?.color?.code,
            }}
          />
          <ChevronRight
            className={cn(
              'pointer-events-none absolute -right-0.5',
              fruit?.type === 'plus'
                ? 'h-3 w-3 md:h-4 md:w-4'
                : 'h-5 w-5 md:h-6 md:w-6',
              iconClassName
            )}
            style={{
              animation: 'pulse 1s infinite',
              color: fruit?.color?.code,
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
                ? 'h-3 w-3 md:h-4 md:w-4'
                : 'h-5 w-5 md:h-6 md:w-6',
              iconClassName
            )}
            style={{
              animation: 'pulse 1s infinite',
              color: fruit?.color?.code,
            }}
          />
          <ChevronDown
            className={cn(
              'pointer-events-none absolute -bottom-0.5',
              fruit?.type === 'plus'
                ? 'h-3 w-3 md:h-4 md:w-4'
                : 'h-5 w-5 md:h-6 md:w-6',
              iconClassName
            )}
            style={{
              animation: 'pulse 1s infinite',
              color: fruit?.color?.code,
            }}
          />
        </>
      )}

      {fruit?.type === 'explosive' && (
        <Bomb
          className={cn(
            'pointer-events-none absolute h-4 w-4 md:h-6 md:w-6',
            iconClassName
          )}
          style={{
            animation: 'pulse 1s infinite',
            color: fruit?.color?.code,
          }}
        />
      )}

      {fruit?.type === 'big-explosive' && (
        <Sparkle
          className={cn(
            'pointer-events-none absolute h-4 w-4 md:h-6 md:w-6',
            iconClassName
          )}
          style={{
            animation: 'pulse 1s infinite',
            color: fruit?.color?.code,
          }}
        />
      )}

      {fruit?.type === 'rainbow' && (
        <LoaderPinwheel
          className={cn(
            'text-foreground/70 pointer-events-none absolute h-5 w-5 animate-spin md:h-6 md:w-6',
            iconClassName
          )}
        />
      )}
    </div>
  );
}

export default FruitPlaceholder;
