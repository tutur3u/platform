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
}

interface BubblesProps {
  count?: number;
  className?: string;
}

export function Bubbles({ count = 8, className }: BubblesProps) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);

  useEffect(() => {
    // Generate random bubbles
    const newBubbles: Bubble[] = Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100, // percentage from left
      size: 4 + Math.random() * 8, // 4-12px
      duration: 4 + Math.random() * 4, // 4-8 seconds
      delay: Math.random() * 4, // 0-4 seconds initial delay
    }));
    setBubbles(newBubbles);
  }, [count]);

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 overflow-hidden',
        className
      )}
    >
      {bubbles.map((bubble) => (
        <motion.div
          key={bubble.id}
          className="absolute rounded-full border border-white/30 bg-white/10"
          style={{
            width: bubble.size,
            height: bubble.size,
            left: `${bubble.x}%`,
            bottom: -bubble.size,
          }}
          animate={{
            y: [0, -400],
            x: [0, Math.sin(bubble.id) * 20, 0],
            opacity: [0.6, 0.8, 0.4, 0],
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
            className="absolute top-1 left-1 rounded-full bg-white/40"
            style={{
              width: bubble.size * 0.25,
              height: bubble.size * 0.25,
            }}
          />
        </motion.div>
      ))}
    </div>
  );
}
