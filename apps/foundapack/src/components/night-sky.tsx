'use client';

import { motion, useScroll, useTransform } from 'framer-motion';
import { useEffect, useState } from 'react';

export function NightSky() {
  const [mounted, setMounted] = useState(false);
  const { scrollYProgress } = useScroll();

  // Parallax transforms
  const farStarsY = useTransform(scrollYProgress, [0, 1], [0, -100]);
  const nearStarsY = useTransform(scrollYProgress, [0, 1], [0, -250]);
  const dustY = useTransform(scrollYProgress, [0, 1], [0, -150]);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <div className="fixed inset-0 z-0 bg-pack-void" />;

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-pack-void">
      <div className="pack-noise absolute inset-0" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-pack-charcoal/30 via-pack-void to-pack-void opacity-90" />

      {/* Deep Space Dust */}
      <motion.div style={{ y: dustY }} className="absolute inset-0 opacity-20">
        <div className="absolute top-[-20%] left-[-10%] h-[140%] w-[120%] bg-[radial-gradient(circle_at_20%_30%,_rgba(251,191,36,0.05)_0%,_transparent_50%)]" />
        <div className="absolute top-[-20%] left-[-10%] h-[140%] w-[120%] bg-[radial-gradient(circle_at_80%_70%,_rgba(249,115,22,0.05)_0%,_transparent_50%)]" />
      </motion.div>

      {/* Stars Layer 1 (Far/Slow) */}
      <motion.div
        style={{ y: farStarsY }}
        className="pack-stars absolute inset-0"
      >
        {[...Array(80)].map((_, i) => {
          const left = (i * 17) % 100;
          const top = (i * 23) % 100;
          const scale = 0.2 + ((i * 7) % 10) / 30;
          const opacity = 0.1 + ((i * 11) % 10) / 30;
          const duration = 5 + (i % 5);

          return (
            <motion.div
              key={`s1-${i}`}
              className="absolute rounded-full bg-white"
              initial={{
                left: `${left}%`,
                top: `${top}%`,
                scale,
                opacity,
              }}
              animate={{
                opacity: [opacity, opacity * 2, opacity],
              }}
              transition={{
                duration,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              style={{
                width: '1px',
                height: '1px',
              }}
            />
          );
        })}
      </motion.div>

      {/* Stars Layer 2 (Near/Twinkle) */}
      <motion.div
        style={{ y: nearStarsY }}
        className="pack-stars absolute inset-0"
      >
        {[...Array(30)].map((_, i) => {
          const left = (i * 31) % 100;
          const top = (i * 37) % 100;
          const scale = 0.5 + ((i * 3) % 10) / 20;
          const opacity = 0.2 + ((i * 5) % 10) / 15;
          const duration = 3 + (i % 3);

          return (
            <motion.div
              key={`s2-${i}`}
              className="absolute rounded-full bg-pack-snow"
              initial={{
                left: `${left}%`,
                top: `${top}%`,
                scale,
                opacity,
              }}
              animate={{
                opacity: [opacity, opacity * 2, opacity],
                scale: [scale, scale * 1.2, scale],
              }}
              transition={{
                duration,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              style={{
                width: '2px',
                height: '2px',
                boxShadow: '0 0 4px rgba(255, 255, 255, 0.3)',
              }}
            />
          );
        })}
      </motion.div>
    </div>
  );
}
