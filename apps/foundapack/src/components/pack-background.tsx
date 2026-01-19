'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function PackBackground() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-0">
      {/* Embers Layer */}
      <div className="pack-embers absolute inset-0 overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full bg-pack-ember"
            initial={{
              left: `${Math.random() * 100}%`,
              bottom: '-10%',
              scale: 0,
              opacity: 0,
            }}
            animate={{
              bottom: '110%',
              scale: [0, 1, 0.5],
              opacity: [0, 0.8, 0],
              x: [0, (Math.random() - 0.5) * 100],
            }}
            transition={{
              duration: Math.random() * 10 + 10,
              repeat: Infinity,
              ease: 'linear',
              delay: Math.random() * 10,
            }}
            style={{
              width: `${Math.random() * 4 + 2}px`,
              height: `${Math.random() * 4 + 2}px`,
              boxShadow: '0 0 10px var(--color-pack-glow-orange)',
              willChange: 'transform, opacity',
            }}
          />
        ))}
      </div>
    </div>
  );
}
