'use client';

import { Sparkles, Star } from '@tuturuuu/icons';
import { Progress } from '@tuturuuu/ui/progress';
import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';

interface XpBarProps {
  level: number;
  xp: number;
  xpToNextLevel: number;
  className?: string;
  showLabel?: boolean;
}

export function XpBar({
  level,
  xp,
  xpToNextLevel,
  className,
  showLabel = true,
}: XpBarProps) {
  const progress = (xp / xpToNextLevel) * 100;

  return (
    <div className={cn('w-full', className)}>
      {showLabel && (
        <div className="mb-1 flex items-center justify-between text-sm">
          <div className="flex items-center gap-1.5">
            <Star className="h-4 w-4 text-dynamic-yellow" />
            <span className="font-medium">Level {level}</span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <span>
              {xp} / {xpToNextLevel} XP
            </span>
            <Sparkles className="h-3 w-3" />
          </div>
        </div>
      )}

      <div className="relative">
        <Progress value={progress} className="h-3" />

        {/* Animated shine effect when close to level up */}
        {progress > 80 && (
          <motion.div
            className="absolute inset-0 overflow-hidden rounded-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-dynamic-yellow/30 via-dynamic-yellow/60 to-dynamic-yellow/30" />
          </motion.div>
        )}
      </div>

      {/* Level up indicator */}
      {progress > 95 && (
        <motion.p
          className="mt-1 text-center font-medium text-dynamic-yellow text-xs"
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 0.5, repeat: Infinity }}
        >
          Almost there!
        </motion.p>
      )}
    </div>
  );
}
