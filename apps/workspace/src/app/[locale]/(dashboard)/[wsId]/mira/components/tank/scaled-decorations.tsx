'use client';

import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';

interface ScaledDecorationsProps {
  isFocusMode?: boolean;
  className?: string;
}

export function ScaledDecorations({
  isFocusMode = false,
  className,
}: ScaledDecorationsProps) {
  const opacity = isFocusMode ? 0.3 : 1;

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 z-10 transition-opacity duration-500',
        className
      )}
      style={{ opacity }}
    >
      {/* Seaweed group - left side */}
      <div className="absolute bottom-0 left-[5%]">
        <motion.svg
          viewBox="0 0 40 150"
          className="h-48 w-12 md:h-64 md:w-16"
          animate={{ skewX: [-3, 3, -3] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          aria-hidden="true"
        >
          <path
            d="M20 150 Q5 120 20 90 Q35 60 20 30 Q10 15 20 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="round"
            className="text-dynamic-green/50"
          />
        </motion.svg>
      </div>

      <div className="absolute bottom-0 left-[8%]">
        <motion.svg
          viewBox="0 0 40 150"
          className="h-36 w-10 md:h-48 md:w-12"
          animate={{ skewX: [2, -2, 2] }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 0.5,
          }}
          aria-hidden="true"
        >
          <path
            d="M20 150 Q10 110 20 70 Q30 35 20 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
            className="text-dynamic-green/40"
          />
        </motion.svg>
      </div>

      <div className="absolute bottom-0 left-[12%]">
        <motion.svg
          viewBox="0 0 40 150"
          className="h-28 w-8 md:h-40 md:w-10"
          animate={{ skewX: [-2, 2, -2] }}
          transition={{
            duration: 3.5,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 1,
          }}
          aria-hidden="true"
        >
          <path
            d="M20 150 Q8 100 20 60 Q32 20 20 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="5"
            strokeLinecap="round"
            className="text-dynamic-green/45"
          />
        </motion.svg>
      </div>

      {/* Seaweed group - right side */}
      <div className="absolute right-[6%] bottom-0">
        <motion.svg
          viewBox="0 0 40 150"
          className="h-56 w-14 md:h-72 md:w-18"
          animate={{ skewX: [4, -4, 4] }}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 0.8,
          }}
          aria-hidden="true"
        >
          <path
            d="M20 150 Q5 100 20 60 Q35 25 20 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            strokeLinecap="round"
            className="text-dynamic-green/45"
          />
        </motion.svg>
      </div>

      <div className="absolute right-[10%] bottom-0">
        <motion.svg
          viewBox="0 0 40 150"
          className="h-40 w-10 md:h-52 md:w-12"
          animate={{ skewX: [-3, 3, -3] }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 1.2,
          }}
          aria-hidden="true"
        >
          <path
            d="M20 150 Q12 90 20 50 Q28 15 20 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
            className="text-dynamic-green/40"
          />
        </motion.svg>
      </div>

      {/* Rocks at bottom */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-center gap-2 px-8 pb-4 md:gap-4 md:px-16 md:pb-8">
        <div className="h-6 w-12 rounded-full bg-muted-foreground/25 md:h-10 md:w-20" />
        <div className="h-8 w-16 rounded-full bg-muted-foreground/20 md:h-14 md:w-28" />
        <div className="h-5 w-10 rounded-full bg-muted-foreground/30 md:h-8 md:w-16" />
        <div className="h-10 w-20 rounded-full bg-muted-foreground/25 md:h-16 md:w-36" />
        <div className="h-6 w-14 rounded-full bg-muted-foreground/20 md:h-10 md:w-24" />
        <div className="h-7 w-12 rounded-full bg-muted-foreground/25 md:h-12 md:w-20" />
        <div className="h-5 w-10 rounded-full bg-muted-foreground/20 md:h-8 md:w-16" />
      </div>

      {/* Shells scattered */}
      <div className="absolute bottom-6 left-[20%] md:bottom-12">
        <div className="h-3 w-5 rotate-12 rounded-t-full bg-dynamic-pink/25 md:h-5 md:w-8" />
      </div>
      <div className="absolute right-[25%] bottom-8 md:bottom-16">
        <div className="h-3 w-4 -rotate-6 rounded-t-full bg-dynamic-yellow/25 md:h-4 md:w-6" />
      </div>
      <div className="absolute bottom-5 left-[40%] md:bottom-10">
        <div className="h-2 w-3 rotate-20 rounded-t-full bg-dynamic-orange/20 md:h-3 md:w-5" />
      </div>

      {/* Starfish */}
      <motion.svg
        viewBox="0 0 24 24"
        className="absolute right-[35%] bottom-5 h-6 w-6 text-dynamic-yellow/35 md:bottom-10 md:h-10 md:w-10"
        animate={{ rotate: [0, 8, 0, -8, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        aria-hidden="true"
      >
        <polygon
          points="12,2 15,9 22,9 16,14 18,22 12,17 6,22 8,14 2,9 9,9"
          fill="currentColor"
        />
      </motion.svg>

      {/* Additional starfish */}
      <motion.svg
        viewBox="0 0 24 24"
        className="absolute bottom-8 left-[30%] h-5 w-5 text-dynamic-pink/30 md:bottom-14 md:h-8 md:w-8"
        animate={{ rotate: [0, -5, 0, 5, 0] }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 2,
        }}
        aria-hidden="true"
      >
        <polygon
          points="12,2 15,9 22,9 16,14 18,22 12,17 6,22 8,14 2,9 9,9"
          fill="currentColor"
        />
      </motion.svg>

      {/* Treasure chest hint */}
      <div className="absolute bottom-4 left-[60%] h-6 w-10 rounded-t-lg border-2 border-dynamic-yellow/20 bg-dynamic-yellow/15 md:bottom-8 md:h-10 md:w-16" />
    </div>
  );
}
