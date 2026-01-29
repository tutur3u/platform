'use client';

import { Flame, Sparkles, Star } from '@tuturuuu/icons';
import { Progress } from '@tuturuuu/ui/progress';
import { cn } from '@tuturuuu/utils/format';
import { AnimatePresence, motion } from 'framer-motion';
import type { TunaPet } from '../../types/tuna';

interface StatsBarProps {
  pet: TunaPet;
  isFocusMode?: boolean;
  className?: string;
}

export function StatsBar({
  pet,
  isFocusMode = false,
  className,
}: StatsBarProps) {
  const xpProgress = (pet.xp / pet.xp_to_next_level) * 100;

  return (
    <AnimatePresence>
      {!isFocusMode && (
        <motion.div
          className={cn(
            'fixed top-0 right-0 left-0 z-30',
            'mx-2 mt-2 md:mx-4 md:mt-4',
            className
          )}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
        >
          <div
            className={cn(
              'mx-auto max-w-4xl',
              'rounded-2xl border border-border/30',
              'bg-background/60 backdrop-blur-lg',
              'px-4 py-3 shadow-xl',
              'flex items-center gap-4'
            )}
          >
            {/* Level badge */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-full bg-dynamic-purple/20 px-2.5 py-1">
                <Star className="h-4 w-4 text-dynamic-yellow" />
                <span className="font-bold text-sm">Lv.{pet.level}</span>
              </div>
            </div>

            {/* XP Progress bar */}
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="relative min-w-0 flex-1">
                <Progress value={xpProgress} className="h-2.5" />
                {xpProgress > 80 && (
                  <motion.div
                    className="absolute inset-0 overflow-hidden rounded-full"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0.3, 0.6, 0.3] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-dynamic-yellow/30 via-dynamic-yellow/50 to-dynamic-yellow/30" />
                  </motion.div>
                )}
              </div>
              <div className="flex items-center gap-1 text-muted-foreground text-xs">
                <Sparkles className="h-3 w-3" />
                <span className="font-medium tabular-nums">
                  {pet.xp}/{pet.xp_to_next_level}
                </span>
              </div>
            </div>

            {/* Streak indicator */}
            {pet.streak_days > 0 && (
              <div className="flex items-center gap-1 rounded-full bg-dynamic-orange/10 px-2.5 py-1">
                <Flame className="h-4 w-4 text-dynamic-orange" />
                <span className="font-medium text-dynamic-orange text-sm tabular-nums">
                  {pet.streak_days}d
                </span>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Compact version for hover peek in focus mode
export function StatsBarPeek({
  pet,
  className,
}: {
  pet: TunaPet;
  className?: string;
}) {
  const xpProgress = (pet.xp / pet.xp_to_next_level) * 100;

  return (
    <motion.div
      className={cn(
        'fixed top-2 left-1/2 z-40 -translate-x-1/2',
        'rounded-full border border-border/30',
        'bg-background/70 backdrop-blur-lg',
        'px-3 py-1.5 shadow-lg',
        'flex items-center gap-3 text-xs',
        className
      )}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      <div className="flex items-center gap-1">
        <Star className="h-3 w-3 text-dynamic-yellow" />
        <span className="font-medium">Lv.{pet.level}</span>
      </div>
      <div className="h-3 w-px bg-border" />
      <div className="flex items-center gap-1.5">
        <Progress value={xpProgress} className="h-1.5 w-16" />
        <span className="text-muted-foreground tabular-nums">
          {Math.round(xpProgress)}%
        </span>
      </div>
      {pet.streak_days > 0 && (
        <>
          <div className="h-3 w-px bg-border" />
          <div className="flex items-center gap-1">
            <Flame className="h-3 w-3 text-dynamic-orange" />
            <span className="font-medium text-dynamic-orange">
              {pet.streak_days}
            </span>
          </div>
        </>
      )}
    </motion.div>
  );
}
