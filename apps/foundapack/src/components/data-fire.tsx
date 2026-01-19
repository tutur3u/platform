'use client';

import { motion } from 'framer-motion';
import { useMemo } from 'react';

// Seeded pseudo-random number generator for consistent values
function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export function DataFire() {
  // Pre-generate particle properties with seeded random values
  const particles = useMemo(() => {
    return [...Array(24)].map((_, i) => {
      const seed = i * 1000;
      return {
        size: seededRandom(seed) * 4 + 2,
        duration: seededRandom(seed + 1) * 2 + 2,
        delay: seededRandom(seed + 2) * 3,
        xOffset: (seededRandom(seed + 3) - 0.5) * 100,
      };
    });
  }, []);

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {/* Central Core Glow */}
      <div className="absolute h-32 w-32 rounded-full bg-pack-amber/20 blur-[60px]" />

      {/* Updraft Particles */}
      {particles.map((particle, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: particle.size,
            height: particle.size,
            background:
              i % 3 === 0
                ? 'var(--color-pack-white)'
                : 'var(--color-pack-amber)',
            boxShadow: `0 0 ${particle.size * 2}px var(--color-pack-glow-amber)`,
          }}
          initial={{ opacity: 0, y: 40, x: 0 }}
          animate={{
            opacity: [0, 1, 0],
            y: -120,
            x: particle.xOffset,
            scale: [0.5, 1.2, 0],
          }}
          transition={{
            duration: particle.duration,
            repeat: Infinity,
            delay: particle.delay,
            ease: 'easeOut',
          }}
        />
      ))}

      {/* Swirling Rings (Base) */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
        className="absolute h-40 w-40 rounded-full border border-pack-amber/10 opacity-50"
        style={{
          borderTopColor: 'transparent',
          borderBottomColor: 'transparent',
        }}
      />
      <motion.div
        animate={{ rotate: -360 }}
        transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
        className="absolute h-28 w-28 rounded-full border border-pack-orange/20 border-dashed"
      />
    </div>
  );
}
