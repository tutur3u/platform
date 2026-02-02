'use client';

import { cn } from '@tuturuuu/utils/format';
import { AnimatePresence, motion } from 'framer-motion';

interface ChatBubbleProps {
  message: string | null;
  isVisible: boolean;
  position?: 'top' | 'right';
  className?: string;
}

export function ChatBubble({
  message,
  isVisible,
  position = 'top',
  className,
}: ChatBubbleProps) {
  const positionClasses = {
    top: 'bottom-full mb-3 left-1/2 -translate-x-1/2',
    right: 'left-full ml-3 top-1/2 -translate-y-1/2',
  };

  const tailClasses = {
    top: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-full border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-background',
    right:
      'left-0 top-1/2 -translate-y-1/2 -translate-x-full border-t-8 border-b-8 border-r-8 border-t-transparent border-b-transparent border-r-background',
  };

  return (
    <AnimatePresence>
      {isVisible && message && (
        <motion.div
          className={cn(
            'absolute z-10 max-w-xs',
            positionClasses[position],
            className
          )}
          initial={{ opacity: 0, scale: 0.8, y: position === 'top' ? 10 : 0 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: position === 'top' ? 10 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="relative rounded-xl border bg-background px-4 py-3 shadow-lg">
            <p className="text-sm">{message}</p>

            {/* Speech bubble tail */}
            <div className={cn('absolute h-0 w-0', tailClasses[position])} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
