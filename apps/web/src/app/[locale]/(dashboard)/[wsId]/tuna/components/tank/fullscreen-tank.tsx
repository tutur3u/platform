'use client';

import { cn } from '@tuturuuu/utils/format';
import { AnimatePresence, motion } from 'framer-motion';
import type { TunaAnimationState, TunaMood } from '../../types/tuna';
import { AmbientEffects } from './ambient-effects';
import { ScaledBubbles } from './scaled-bubbles';
import { ScaledDecorations } from './scaled-decorations';
import { WanderingFish } from './wandering-fish';

interface FullscreenTankProps {
  mood: TunaMood;
  animationState: TunaAnimationState;
  isFocusMode?: boolean;
  className?: string;
}

// Mood-based gradient backgrounds for light mode
const tankGradients: Record<TunaMood, string> = {
  happy: 'from-sky-300/90 via-cyan-400/70 to-blue-500/90',
  neutral: 'from-slate-300/90 via-blue-300/70 to-slate-400/90',
  tired: 'from-slate-400/90 via-gray-400/70 to-slate-500/90',
  sad: 'from-indigo-300/90 via-blue-400/70 to-indigo-500/90',
  excited: 'from-amber-200/90 via-yellow-300/70 to-orange-300/90',
  focused: 'from-purple-200/90 via-violet-300/70 to-purple-400/90',
};

// Dark mode gradients
const darkTankGradients: Record<TunaMood, string> = {
  happy: 'dark:from-sky-900/95 dark:via-cyan-800/80 dark:to-blue-900/95',
  neutral: 'dark:from-slate-800/95 dark:via-slate-700/80 dark:to-slate-900/95',
  tired: 'dark:from-gray-800/95 dark:via-gray-700/80 dark:to-gray-900/95',
  sad: 'dark:from-indigo-900/95 dark:via-blue-800/80 dark:to-indigo-950/95',
  excited:
    'dark:from-amber-900/95 dark:via-yellow-800/80 dark:to-orange-900/95',
  focused:
    'dark:from-purple-900/95 dark:via-violet-800/80 dark:to-purple-950/95',
};

export function FullscreenTank({
  mood,
  animationState,
  isFocusMode = false,
  className,
}: FullscreenTankProps) {
  return (
    <div
      className={cn(
        // Fixed positioning to fill viewport
        'fixed inset-0 z-0',
        // Negative margins to break out of dashboard padding
        '-m-2 -mt-14 md:-m-4 md:-mt-4',
        // Base gradient
        'bg-gradient-to-b',
        tankGradients[mood],
        darkTankGradients[mood],
        // Transition for mood changes
        'transition-colors duration-1000 ease-in-out',
        className
      )}
    >
      {/* Water surface effect at top */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/20 via-white/5 to-transparent" />

      {/* Light rays from surface */}
      <AmbientEffects isFocusMode={isFocusMode} />

      {/* Decorations layer (z-10) */}
      <ScaledDecorations isFocusMode={isFocusMode} />

      {/* Bubbles layer (z-10) */}
      <ScaledBubbles count={isFocusMode ? 4 : 12} isFocusMode={isFocusMode} />

      {/* Fish in center (z-10) */}
      <WanderingFish
        mood={mood}
        animationState={animationState}
        isFocusMode={isFocusMode}
      />

      {/* Focus mode overlay - dims everything slightly */}
      <AnimatePresence>
        {isFocusMode && (
          <motion.div
            className="pointer-events-none absolute inset-0 z-5 bg-black/20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          />
        )}
      </AnimatePresence>

      {/* Bottom depth gradient */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/30 to-transparent" />
    </div>
  );
}
