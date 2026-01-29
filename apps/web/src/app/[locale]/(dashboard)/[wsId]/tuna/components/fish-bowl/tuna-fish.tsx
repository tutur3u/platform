'use client';

import { cn } from '@tuturuuu/utils/format';
import { motion, type Variants } from 'framer-motion';
import type { TunaAnimationState, TunaMood } from '../../types/tuna';

interface TunaFishProps {
  mood: TunaMood;
  animationState: TunaAnimationState;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'w-16 h-12',
  md: 'w-24 h-18',
  lg: 'w-32 h-24',
};

// Fish color based on mood
const moodColors = {
  happy: 'fill-dynamic-orange',
  neutral: 'fill-dynamic-blue',
  tired: 'fill-dynamic-gray',
  sad: 'fill-dynamic-indigo',
  excited: 'fill-dynamic-yellow',
  focused: 'fill-dynamic-purple',
};

// Animation variants for different states
const fishVariants: Variants = {
  idle: {
    x: [0, 10, 0, -10, 0],
    y: [0, -5, 0, -3, 0],
    rotate: [0, 2, 0, -2, 0],
    transition: {
      duration: 4,
      repeat: Infinity,
      ease: 'easeInOut' as const,
    },
  },
  happy: {
    x: [0, 15, 0, -15, 0],
    y: [0, -10, 5, -8, 0],
    rotate: [0, 5, 0, -5, 0],
    scale: [1, 1.05, 1, 1.05, 1],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeInOut' as const,
    },
  },
  sad: {
    x: [0, 3, 0, -3, 0],
    y: [0, 2, 0, 2, 0],
    rotate: [0, -3, 0, -3, 0],
    transition: {
      duration: 5,
      repeat: Infinity,
      ease: 'easeInOut' as const,
    },
  },
  listening: {
    x: 0,
    y: [0, -3, 0],
    rotate: [0, 5, 0],
    scale: [1, 1.02, 1],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: 'easeInOut' as const,
    },
  },
  speaking: {
    x: [0, 5, 0, -5, 0],
    y: [0, -5, 0, -5, 0],
    scale: [1, 1.05, 1, 1.05, 1],
    transition: {
      duration: 0.8,
      repeat: Infinity,
      ease: 'easeInOut' as const,
    },
  },
  celebrating: {
    x: [0, 20, 0, -20, 0],
    y: [0, -20, 0, -20, 0],
    rotate: [0, 15, 0, -15, 0],
    scale: [1, 1.2, 1, 1.2, 1],
    transition: {
      duration: 0.6,
      repeat: Infinity,
      ease: 'easeOut' as const,
    },
  },
  sleeping: {
    x: 0,
    y: [0, 2, 0],
    rotate: -5,
    scale: 0.95,
    transition: {
      duration: 3,
      repeat: Infinity,
      ease: 'easeInOut' as const,
    },
  },
  eating: {
    x: [0, 5, 0],
    y: [0, 3, 0],
    scale: [1, 1.1, 1],
    transition: {
      duration: 0.3,
      repeat: 5,
      ease: 'easeOut' as const,
    },
  },
  focused: {
    x: 0,
    y: [0, -2, 0],
    rotate: 0,
    scale: 1,
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeInOut' as const,
    },
  },
};

// Eye animation based on state
const eyeVariants = {
  open: {
    scaleY: 1,
    transition: { duration: 0.1 },
  },
  closed: {
    scaleY: 0.1,
    transition: { duration: 0.1 },
  },
  blink: {
    scaleY: [1, 0.1, 1],
    transition: {
      duration: 0.2,
      repeat: Infinity,
      repeatDelay: 3,
    },
  },
};

export function TunaFish({
  mood,
  animationState,
  className,
  size = 'lg',
}: TunaFishProps) {
  const colorClass = moodColors[mood];
  const isSleeping = animationState === 'sleeping';

  return (
    <motion.div
      className={cn('relative', sizeClasses[size], className)}
      variants={fishVariants}
      animate={animationState}
      initial="idle"
    >
      {/* Fish SVG */}
      <motion.svg
        viewBox="0 0 120 80"
        className="h-full w-full"
        aria-label="Tuna fish"
        role="img"
      >
        {/* Fish body */}
        <motion.ellipse
          cx="55"
          cy="40"
          rx="40"
          ry="25"
          className={cn(colorClass, 'opacity-90')}
        />

        {/* Tail fin */}
        <motion.path
          d="M15 40 L-5 20 L-5 60 Z"
          className={cn(colorClass, 'opacity-80')}
          animate={{
            d: [
              'M15 40 L-5 20 L-5 60 Z',
              'M15 40 L0 15 L0 65 Z',
              'M15 40 L-5 20 L-5 60 Z',
            ],
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />

        {/* Dorsal fin */}
        <motion.path
          d="M45 15 L55 5 L70 15"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          className={cn(colorClass.replace('fill-', 'text-'), 'opacity-70')}
        />

        {/* Side fin */}
        <motion.ellipse
          cx="50"
          cy="50"
          rx="12"
          ry="6"
          className={cn(colorClass, 'opacity-70')}
          animate={{
            rotate: [0, -15, 0],
          }}
          transition={{
            duration: 1,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />

        {/* Eye white */}
        <circle cx="75" cy="35" r="10" className="fill-white" />

        {/* Eye pupil */}
        <motion.circle
          cx="77"
          cy="35"
          r="5"
          className="fill-foreground"
          variants={eyeVariants}
          animate={isSleeping ? 'closed' : 'blink'}
        />

        {/* Eye shine */}
        <circle cx="79" cy="33" r="2" className="fill-white opacity-80" />

        {/* Mouth - changes based on mood */}
        {mood === 'happy' || mood === 'excited' ? (
          <motion.path
            d="M85 48 Q90 55 85 55"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            className="text-foreground"
          />
        ) : mood === 'sad' ? (
          <motion.path
            d="M85 52 Q90 48 95 52"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            className="text-foreground"
          />
        ) : (
          <motion.line
            x1="85"
            y1="50"
            x2="95"
            y2="50"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            className="text-foreground"
          />
        )}

        {/* Blush for happy/excited */}
        {(mood === 'happy' || mood === 'excited') && (
          <circle cx="85" cy="42" r="4" className="fill-dynamic-pink/30" />
        )}

        {/* Z's for sleeping */}
        {isSleeping && (
          <motion.text
            x="90"
            y="25"
            className="fill-foreground/50 font-bold text-xs"
            animate={{
              opacity: [0, 1, 0],
              y: [25, 15, 5],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'easeOut',
            }}
          >
            Z
          </motion.text>
        )}
      </motion.svg>

      {/* Speech bubble indicator when speaking */}
      {animationState === 'speaking' && (
        <motion.div
          className="absolute -top-8 left-1/2 -translate-x-1/2 rounded-full bg-background/90 px-3 py-1 text-xs shadow-md"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
        >
          <span className="inline-flex gap-0.5">
            <motion.span
              animate={{ y: [0, -2, 0] }}
              transition={{ duration: 0.4, repeat: Infinity, delay: 0 }}
            >
              .
            </motion.span>
            <motion.span
              animate={{ y: [0, -2, 0] }}
              transition={{ duration: 0.4, repeat: Infinity, delay: 0.1 }}
            >
              .
            </motion.span>
            <motion.span
              animate={{ y: [0, -2, 0] }}
              transition={{ duration: 0.4, repeat: Infinity, delay: 0.2 }}
            >
              .
            </motion.span>
          </span>
        </motion.div>
      )}
    </motion.div>
  );
}
