'use client';

import { cn } from '@tuturuuu/utils/format';
import { AnimatePresence, motion } from 'framer-motion';
import { useFishPosition } from '../../hooks/use-fish-position';

interface FloatingChatBubbleProps {
  message: string | null;
  isVisible: boolean;
  className?: string;
}

export function FloatingChatBubble({
  message,
  isVisible,
  className,
}: FloatingChatBubbleProps) {
  const fishPosition = useFishPosition();

  return (
    <AnimatePresence>
      {isVisible && message && (
        <motion.div
          className={cn('fixed z-50', className)}
          style={{
            // Position bubble above the fish, relative to viewport center
            left: `calc(50% + ${fishPosition.x}px)`,
            top: `calc(50% + ${fishPosition.y - 120}px)`,
            transform: 'translate(-50%, -100%)',
          }}
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 20 }}
          transition={{ duration: 0.3, type: 'spring', damping: 20 }}
        >
          <div className="relative max-w-xs rounded-2xl border border-border/30 bg-background/90 px-4 py-3 shadow-xl backdrop-blur-lg md:max-w-sm">
            <p className="text-center text-sm md:text-base">{message}</p>

            {/* Speech bubble tail pointing down */}
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2">
              <div className="h-0 w-0 border-background/90 border-t-8 border-r-8 border-r-transparent border-l-8 border-l-transparent" />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
