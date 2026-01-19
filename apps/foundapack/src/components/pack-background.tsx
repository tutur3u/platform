'use client';

import { motion, useScroll, useTransform } from 'framer-motion';
import { useEffect, useState } from 'react';

export function PackBackground() {
  const [mounted, setMounted] = useState(false);
  const { scrollYProgress } = useScroll();

  // Ember global opacity increases during scene changes
  const transitionEmberOpacity = useTransform(
    scrollYProgress,
    [0, 0.2, 0.3, 0.6, 0.7, 1],
    [0.4, 1, 0.5, 1, 0.5, 0.25]
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <motion.div
      style={{ opacity: transitionEmberOpacity }}
      className="pointer-events-none fixed inset-0 z-0"
    >
      <div className="pack-vignette absolute inset-0" />

      {/* Cozy Warmth Layer - Ground Glow */}
      <div className="absolute bottom-0 left-1/2 h-[60vh] w-full -translate-x-1/2 bg-[radial-gradient(ellipse_at_bottom,_rgba(251,191,36,0.15)_0%,_rgba(249,115,22,0.05)_40%,_transparent_70%)]" />

      {/* Deep Smoke/Mist Layer */}
      <div className="absolute inset-0 overflow-hidden opacity-30">
        {[...Array(8)].map((_, i) => (
          <motion.div
            key={`smoke-${i}`}
            className="absolute h-[70vh] w-[70vh] rounded-full bg-pack-charcoal blur-[120px]"
            initial={{
              left: `${(i * 15) % 100}%`,
              bottom: '-20%',
              opacity: 0,
            }}
            animate={{
              bottom: '120%',
              opacity: [0, 0.5, 0],
              x: [0, i % 2 === 0 ? 50 : -50],
            }}
            transition={{
              duration: 30 + i * 2,
              repeat: Infinity,
              ease: 'linear',
              delay: i * -5,
            }}
          />
        ))}
      </div>

      {/* Embers Layer */}
      <div className="pack-embers absolute inset-0 overflow-hidden">
        {[...Array(50)].map((_, i) => {
          const size = 3 + (i % 4);
          const xOffset = ((i * 7) % 300) - 150;
          return (
            <motion.div
              key={i}
              className="absolute rounded-full bg-pack-ember"
              initial={{
                left: `${(i * 13) % 100}%`,
                bottom: '-5%',
                scale: 0,
                opacity: 0,
              }}
              animate={{
                bottom: '110%',
                scale: [0, 1.2, 0.6],
                opacity: [0, 0.9, 0],
                x: [0, xOffset],
                rotate: [0, i % 2 === 0 ? 720 : -720],
              }}
              transition={{
                duration: 10 + (i % 5),
                repeat: Infinity,
                ease: 'easeOut',
                delay: i * -0.5,
              }}
              style={{
                width: `${size}px`,
                height: `${size}px`,
                boxShadow: `0 0 ${size * 3}px var(--color-pack-glow-orange)`,
                filter: 'blur(0.5px)',
                willChange: 'transform, opacity',
              }}
            />
          );
        })}
      </div>
    </motion.div>
  );
}
