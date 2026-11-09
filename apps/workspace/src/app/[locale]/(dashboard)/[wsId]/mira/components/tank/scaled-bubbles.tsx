'use client';

import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

interface Bubble {
  id: number;
  x: number;
  size: number;
  duration: number;
  delay: number;
  opacity: number;
}

interface ScaledBubblesProps {
  count?: number;
  isFocusMode?: boolean;
  className?: string;
}

export function ScaledBubbles({
  count = 12,
  isFocusMode = false,
  className,
}: ScaledBubblesProps) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);

  useEffect(() => {
    // Generate random bubbles scaled to viewport
    const newBubbles: Bubble[] = Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100, // percentage from left
      size: 8 + Math.random() * 24, // 8-32px (larger for fullscreen)
      duration: 6 + Math.random() * 8, // 6-14 seconds (slower for larger viewport)
      delay: Math.random() * 6, // 0-6 seconds initial delay
      opacity: isFocusMode ? 0.3 : 0.5 + Math.random() * 0.3,
    }));
    setBubbles(newBubbles);
  }, [count, isFocusMode]);

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 z-10 overflow-hidden',
        className
      )}
    >
      {bubbles.map((bubble) => (
        <motion.div
          key={bubble.id}
          className="absolute rounded-full border border-white/40 bg-white/10"
          style={{
            width: bubble.size,
            height: bubble.size,
            left: `${bubble.x}%`,
            bottom: -bubble.size,
          }}
          animate={{
            y: [0, -window.innerHeight - bubble.size * 2],
            x: [
              0,
              Math.sin(bubble.id * 0.7) * 40,
              Math.sin(bubble.id * 0.5) * 20,
              0,
            ],
            opacity: [0, bubble.opacity, bubble.opacity * 0.8, 0],
          }}
          transition={{
            duration: bubble.duration,
            delay: bubble.delay,
            repeat: Infinity,
            ease: 'easeOut',
          }}
        >
          {/* Bubble shine */}
          <div
            className="absolute rounded-full bg-white/50"
            style={{
              width: bubble.size * 0.25,
              height: bubble.size * 0.25,
              left: bubble.size * 0.15,
              top: bubble.size * 0.15,
            }}
          />
        </motion.div>
      ))}
    </div>
  );
}
