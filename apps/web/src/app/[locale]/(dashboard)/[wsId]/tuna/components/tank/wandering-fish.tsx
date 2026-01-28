'use client';

import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useSetFishPosition } from '../../hooks/use-fish-position';
import type { TunaAnimationState, TunaMood } from '../../types/tuna';

interface WanderingFishProps {
  mood: TunaMood;
  animationState: TunaAnimationState;
  isFocusMode?: boolean;
  className?: string;
}

// Fish color based on mood
const moodColors: Record<TunaMood, string> = {
  happy: 'fill-dynamic-orange',
  neutral: 'fill-dynamic-blue',
  tired: 'fill-dynamic-gray',
  sad: 'fill-dynamic-indigo',
  excited: 'fill-dynamic-yellow',
  focused: 'fill-dynamic-purple',
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

// Generate random target position with direction tracking
function generateRandomTarget(
  rangeX: number,
  rangeY: number,
  currentX: number
) {
  const newX = (Math.random() - 0.5) * rangeX * 2;
  return {
    x: newX,
    y: (Math.random() - 0.5) * rangeY * 2,
    rotate: (Math.random() - 0.5) * 15, // Reduced from 30 for smoother movement
    scale: 1, // Fixed scale - no bobbing
    facingLeft: newX < currentX, // Face left if moving left
  };
}

// States where the fish should NOT wander (active/engaged states)
const ACTIVE_STATES: TunaAnimationState[] = [
  'speaking',
  'listening',
  'eating',
  'celebrating',
  'sleeping',
  'focused',
];

export function WanderingFish({
  mood,
  animationState,
  isFocusMode = false,
  className,
}: WanderingFishProps) {
  const colorClass = moodColors[mood];
  const isSleeping = animationState === 'sleeping';
  const setFishPosition = useSetFishPosition();

  // Determine if fish should wander: allowed for idle/mood states, not for active states
  const shouldWander = !ACTIVE_STATES.includes(animationState);

  // Active swimming affects tail/fin speed - faster for happy, slower for sad
  const isActiveSwimming = shouldWander && animationState !== 'sad';

  // Current position state for the wandering animation (includes facing direction)
  const [position, setPosition] = useState({
    x: 0,
    y: 0,
    rotate: 0,
    scale: 1,
    facingLeft: false,
  });
  const animationRef = useRef<number | null>(null);
  const isAnimatingRef = useRef(false);

  // Tail speed based on activity
  const tailSpeed = isSleeping ? 2.5 : isActiveSwimming ? 0.5 : 0.8;

  // Wandering effect - runs for idle and mood-based states (happy, sad)
  useEffect(() => {
    if (!shouldWander) {
      // For active states, stop wandering and set specific positions
      isAnimatingRef.current = false;
      if (animationRef.current) {
        clearTimeout(animationRef.current);
      }

      // Set position based on animation state (face right for active states)
      if (animationState === 'sleeping') {
        setPosition({
          x: 0,
          y: 20,
          rotate: -5,
          scale: 0.95,
          facingLeft: false,
        });
      } else {
        // Default centered position for other active states
        setPosition({
          x: 0,
          y: 0,
          rotate: 0,
          scale: 1,
          facingLeft: false,
        });
      }
      return;
    }

    // Calculate movement range based on viewport (inside effect to capture fresh isFocusMode)
    const getMovementRange = () => {
      if (typeof window === 'undefined') return { rangeX: 200, rangeY: 100 };

      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Fish size at lg breakpoint
      const fishWidth = 320;
      const fishHeight = 256;

      // Available space (viewport minus fish size, with padding)
      const availableX = Math.max(0, vw - fishWidth - 100);
      const availableY = Math.max(0, vh - fishHeight - 100);

      // Movement range: 80% of available space normally, 10% in focus mode
      const multiplier = isFocusMode ? 0.1 : 0.8;

      return {
        rangeX: (availableX / 2) * multiplier,
        rangeY: (availableY / 2) * multiplier,
      };
    };

    // Start wandering animation for idle/mood states
    isAnimatingRef.current = true;

    const wander = () => {
      if (!isAnimatingRef.current) return;

      const { rangeX, rangeY } = getMovementRange();
      // Use functional update to get current x position for direction calculation
      setPosition((prev) => generateRandomTarget(rangeX, rangeY, prev.x));

      // Schedule next movement - mood affects swim speed
      // Happy fish swims faster (1.5-3s), sad fish swims slower (3.5-5.5s), others normal (2-4s)
      const baseDuration =
        animationState === 'happy'
          ? 1500
          : animationState === 'sad'
            ? 3500
            : 2000;
      const randomVariation =
        animationState === 'happy'
          ? 1500
          : animationState === 'sad'
            ? 2000
            : 2000;
      const duration = baseDuration + Math.random() * randomVariation;
      animationRef.current = window.setTimeout(wander, duration);
    };

    // Start initial movement
    wander();

    return () => {
      isAnimatingRef.current = false;
      if (animationRef.current) {
        clearTimeout(animationRef.current);
      }
    };
  }, [animationState, isFocusMode, shouldWander]);

  // Sync position to Jotai atom for other components (e.g., chat bubble)
  useEffect(() => {
    setFishPosition({
      x: position.x,
      y: position.y,
      facingLeft: position.facingLeft,
    });
  }, [position.x, position.y, position.facingLeft, setFishPosition]);

  // Get animation properties based on state
  const getAnimateProps = () => {
    // For wandering states (idle, happy, sad), use the position from wandering logic
    if (shouldWander) {
      return {
        x: position.x,
        y: position.y,
        rotate: position.rotate,
        scale: position.scale,
        scaleX: position.facingLeft ? -1 : 1, // Flip horizontally when facing left
      };
    }

    // Specific animations for active/engaged states only (always face right)
    switch (animationState) {
      case 'listening':
        return {
          x: 0,
          y: [0, -15, 0],
          rotate: [0, 5, 0],
          scale: [1, 1.02, 1],
          scaleX: 1,
        };
      case 'speaking':
        return {
          x: [0, 25, 0, -25, 0],
          y: [0, -20, 0, -20, 0],
          rotate: 0,
          scale: [1, 1.08, 1, 1.08, 1],
          scaleX: 1,
        };
      case 'celebrating':
        return {
          x: [0, 120, 0, -120, 0],
          y: [0, -80, 0, -80, 0],
          rotate: [0, 20, 0, -20, 0],
          scale: [1, 1.3, 1, 1.3, 1],
          scaleX: 1,
        };
      case 'sleeping':
        return {
          x: 0,
          y: [20, 25, 20],
          rotate: -5,
          scale: 0.95,
          scaleX: 1,
        };
      case 'eating':
        return {
          x: [0, 15, 0],
          y: [0, 12, 0],
          rotate: 0,
          scale: [1, 1.15, 1],
          scaleX: 1,
        };
      case 'focused':
        return {
          x: [0, 10, 0, -10, 0],
          y: [0, -8, 0, -5, 0],
          rotate: 0,
          scale: 1,
          scaleX: 1,
        };
      default:
        return { x: 0, y: 0, rotate: 0, scale: 1, scaleX: 1 };
    }
  };

  // Get transition based on state
  const getTransition = () => {
    // For wandering states, use spring physics for smooth movement
    if (shouldWander) {
      return {
        type: 'spring' as const,
        stiffness: 60, // Increased from 20 - more responsive
        damping: 25, // Increased from 15 - smoother settling
        mass: 0.8, // Reduced from 1 - lighter feel
        // Separate transition for scaleX to make the flip smooth and quick
        scaleX: {
          type: 'spring' as const,
          stiffness: 100,
          damping: 20,
        },
      };
    }

    // Specific transitions for active states
    switch (animationState) {
      case 'listening':
        return { duration: 2, repeat: Infinity, ease: 'easeInOut' as const };
      case 'speaking':
        return { duration: 1, repeat: Infinity, ease: 'easeInOut' as const };
      case 'celebrating':
        return { duration: 0.8, repeat: Infinity, ease: 'easeOut' as const };
      case 'sleeping':
        return { duration: 4, repeat: Infinity, ease: 'easeInOut' as const };
      case 'eating':
        return { duration: 0.4, repeat: 5, ease: 'easeOut' as const };
      case 'focused':
        return { duration: 4, repeat: Infinity, ease: 'easeInOut' as const };
      default:
        return { duration: 1 };
    }
  };

  return (
    <div className={cn('absolute inset-0 z-10', className)}>
      {/* Fish container - centered, then animated */}
      <div className="flex h-full w-full items-center justify-center">
        <motion.div
          className="h-40 w-56 md:h-56 md:w-72 lg:h-64 lg:w-80"
          animate={getAnimateProps()}
          transition={getTransition()}
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

            {/* Tail fin - wags faster when actively swimming */}
            <motion.path
              d="M15 40 L-5 20 L-5 60 Z"
              className={cn(colorClass, 'opacity-80')}
              animate={{
                d: [
                  'M15 40 L-5 20 L-5 60 Z',
                  'M15 40 L0 12 L0 68 Z',
                  'M15 40 L-5 20 L-5 60 Z',
                  'M15 40 L-8 25 L-8 55 Z',
                  'M15 40 L-5 20 L-5 60 Z',
                ],
              }}
              transition={{
                duration: tailSpeed,
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

            {/* Side fin - paddles when swimming */}
            <motion.ellipse
              cx="50"
              cy="50"
              rx="12"
              ry="6"
              className={cn(colorClass, 'opacity-70')}
              animate={{
                rotate: isActiveSwimming ? [0, -20, 5, -15, 0] : [0, -10, 0],
              }}
              transition={{
                duration: isActiveSwimming ? 0.8 : 1.5,
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
                  y: [25, 10, -5],
                }}
                transition={{
                  duration: 2.5,
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
              className="absolute -top-12 left-1/2 -translate-x-1/2 rounded-full bg-background/90 px-4 py-2 text-sm shadow-lg"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
            >
              <span className="inline-flex gap-0.5">
                <motion.span
                  animate={{ y: [0, -3, 0] }}
                  transition={{ duration: 0.4, repeat: Infinity, delay: 0 }}
                >
                  .
                </motion.span>
                <motion.span
                  animate={{ y: [0, -3, 0] }}
                  transition={{ duration: 0.4, repeat: Infinity, delay: 0.1 }}
                >
                  .
                </motion.span>
                <motion.span
                  animate={{ y: [0, -3, 0] }}
                  transition={{ duration: 0.4, repeat: Infinity, delay: 0.2 }}
                >
                  .
                </motion.span>
              </span>
            </motion.div>
          )}

          {/* Focus mode glow effect around fish */}
          {isFocusMode && (
            <motion.div
              className="absolute inset-0 -z-10 rounded-full bg-dynamic-purple/20 blur-3xl"
              animate={{
                scale: [1, 1.1, 1],
                opacity: [0.3, 0.5, 0.3],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          )}
        </motion.div>
      </div>
    </div>
  );
}
