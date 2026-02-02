'use client';

import { cn } from '@tuturuuu/utils/format';
import type { TunaAnimationState, TunaMood } from '../../types/tuna';
import { Bubbles } from './bubbles';
import { Decorations } from './decorations';
import { TunaFish } from './tuna-fish';

interface FishBowlProps {
  mood: TunaMood;
  animationState: TunaAnimationState;
  name?: string;
  level?: number;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showDecorations?: boolean;
}

const sizeClasses = {
  sm: 'w-48 h-40',
  md: 'w-64 h-52',
  lg: 'w-80 h-64',
};

const bowlGradients = {
  happy: 'from-sky-200/80 via-cyan-300/60 to-blue-400/80',
  neutral: 'from-slate-200/80 via-blue-200/60 to-slate-300/80',
  tired: 'from-slate-300/80 via-gray-300/60 to-slate-400/80',
  sad: 'from-indigo-200/80 via-blue-300/60 to-indigo-400/80',
  excited: 'from-amber-100/80 via-yellow-200/60 to-orange-200/80',
  focused: 'from-purple-100/80 via-violet-200/60 to-purple-300/80',
};

const darkBowlGradients = {
  happy: 'dark:from-sky-900/80 dark:via-cyan-800/60 dark:to-blue-900/80',
  neutral: 'dark:from-slate-800/80 dark:via-slate-700/60 dark:to-slate-800/80',
  tired: 'dark:from-gray-800/80 dark:via-gray-700/60 dark:to-gray-900/80',
  sad: 'dark:from-indigo-900/80 dark:via-blue-800/60 dark:to-indigo-950/80',
  excited:
    'dark:from-amber-900/80 dark:via-yellow-800/60 dark:to-orange-900/80',
  focused:
    'dark:from-purple-900/80 dark:via-violet-800/60 dark:to-purple-950/80',
};

export function FishBowl({
  mood,
  animationState,
  name = 'Tuna',
  level = 1,
  className,
  size = 'lg',
  showDecorations = true,
}: FishBowlProps) {
  return (
    <div className={cn('relative', sizeClasses[size], className)}>
      {/* Bowl container with glass effect */}
      <div
        className={cn(
          'relative h-full w-full overflow-hidden rounded-[40%_40%_45%_45%] border-4 border-white/30 shadow-xl',
          'bg-gradient-to-b',
          bowlGradients[mood],
          darkBowlGradients[mood]
        )}
      >
        {/* Water shine effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent" />

        {/* Decorations layer */}
        {showDecorations && <Decorations />}

        {/* Bubbles layer */}
        <Bubbles count={6} />

        {/* Fish in the center */}
        <div className="absolute inset-0 flex items-center justify-center">
          <TunaFish
            mood={mood}
            animationState={animationState}
            size={size === 'sm' ? 'sm' : size === 'md' ? 'md' : 'lg'}
          />
        </div>

        {/* Glass reflection */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-4 -right-4 h-16 w-16 rotate-45 rounded-full bg-gradient-to-br from-white/30 via-transparent to-transparent blur-sm" />
        </div>
      </div>

      {/* Name and level badge */}
      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2">
        <div className="flex items-center gap-2 rounded-full border bg-background/90 px-3 py-1 shadow-md">
          <span className="font-medium text-sm">{name}</span>
          <span className="rounded-full bg-dynamic-purple/20 px-1.5 py-0.5 font-bold text-dynamic-purple text-xs">
            Lv.{level}
          </span>
        </div>
      </div>
    </div>
  );
}
