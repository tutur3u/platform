'use client';

import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';

interface DecorationsProps {
  className?: string;
}

export function Decorations({ className }: DecorationsProps) {
  return (
    <div className={cn('pointer-events-none absolute inset-0', className)}>
      {/* Seaweed - left side */}
      <motion.svg
        viewBox="0 0 30 100"
        className="absolute bottom-0 left-4 h-24 w-6"
        animate={{
          skewX: [-2, 2, -2],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        aria-hidden="true"
      >
        <path
          d="M15 100 Q5 80 15 60 Q25 40 15 20 Q10 10 15 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          className="text-dynamic-green/60"
        />
      </motion.svg>

      {/* Seaweed - left side 2 */}
      <motion.svg
        viewBox="0 0 30 100"
        className="absolute bottom-0 left-10 h-20 w-5"
        animate={{
          skewX: [2, -2, 2],
        }}
        transition={{
          duration: 2.5,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 0.5,
        }}
        aria-hidden="true"
      >
        <path
          d="M15 100 Q8 75 15 50 Q22 25 15 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          className="text-dynamic-green/50"
        />
      </motion.svg>

      {/* Seaweed - right side */}
      <motion.svg
        viewBox="0 0 30 100"
        className="absolute right-6 bottom-0 h-28 w-7"
        animate={{
          skewX: [3, -3, 3],
        }}
        transition={{
          duration: 3.5,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 1,
        }}
        aria-hidden="true"
      >
        <path
          d="M15 100 Q5 70 15 45 Q25 20 15 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          className="text-dynamic-green/55"
        />
      </motion.svg>

      {/* Rocks at bottom */}
      <div className="absolute right-0 bottom-0 left-0 flex items-end justify-center gap-1 px-4 pb-2">
        <div className="h-3 w-6 rounded-full bg-muted-foreground/30" />
        <div className="h-4 w-8 rounded-full bg-muted-foreground/25" />
        <div className="h-2 w-5 rounded-full bg-muted-foreground/35" />
        <div className="h-5 w-10 rounded-full bg-muted-foreground/30" />
        <div className="h-3 w-7 rounded-full bg-muted-foreground/25" />
        <div className="h-4 w-6 rounded-full bg-muted-foreground/30" />
      </div>

      {/* Small shells */}
      <div className="absolute bottom-3 left-1/4">
        <div className="h-2 w-3 rotate-12 rounded-t-full bg-dynamic-pink/30" />
      </div>
      <div className="absolute right-1/3 bottom-4">
        <div className="h-2 w-2 -rotate-6 rounded-t-full bg-dynamic-yellow/30" />
      </div>

      {/* Starfish */}
      <motion.svg
        viewBox="0 0 24 24"
        className="absolute right-1/4 bottom-2 h-4 w-4 text-dynamic-yellow/40"
        animate={{
          rotate: [0, 5, 0, -5, 0],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        aria-hidden="true"
      >
        <polygon
          points="12,2 15,9 22,9 16,14 18,22 12,17 6,22 8,14 2,9 9,9"
          fill="currentColor"
        />
      </motion.svg>
    </div>
  );
}
