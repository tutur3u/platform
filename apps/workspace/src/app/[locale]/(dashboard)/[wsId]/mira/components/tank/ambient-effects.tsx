'use client';

import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';

interface AmbientEffectsProps {
  isFocusMode?: boolean;
  className?: string;
}

export function AmbientEffects({
  isFocusMode = false,
  className,
}: AmbientEffectsProps) {
  const opacity = isFocusMode ? 0.15 : 0.3;

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 z-5 overflow-hidden transition-opacity duration-500',
        className
      )}
    >
      {/* Light rays from surface */}
      <div className="absolute inset-x-0 top-0 h-full">
        {/* Ray 1 */}
        <motion.div
          className="absolute top-0 left-[15%] h-[70%] w-24 origin-top bg-gradient-to-b from-white/20 via-white/5 to-transparent md:w-40"
          style={{
            clipPath: 'polygon(30% 0, 70% 0, 100% 100%, 0% 100%)',
            opacity,
          }}
          animate={{
            opacity: [opacity, opacity * 0.6, opacity],
            rotateZ: [-2, 2, -2],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />

        {/* Ray 2 */}
        <motion.div
          className="absolute top-0 left-[35%] h-[80%] w-32 origin-top bg-gradient-to-b from-white/15 via-white/5 to-transparent md:w-48"
          style={{
            clipPath: 'polygon(35% 0, 65% 0, 100% 100%, 0% 100%)',
            opacity: opacity * 0.8,
          }}
          animate={{
            opacity: [opacity * 0.8, opacity * 0.5, opacity * 0.8],
            rotateZ: [1, -1, 1],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 1,
          }}
        />

        {/* Ray 3 */}
        <motion.div
          className="absolute top-0 right-[25%] h-[65%] w-28 origin-top bg-gradient-to-b from-white/18 via-white/5 to-transparent md:w-44"
          style={{
            clipPath: 'polygon(25% 0, 75% 0, 100% 100%, 0% 100%)',
            opacity: opacity * 0.9,
          }}
          animate={{
            opacity: [opacity * 0.9, opacity * 0.6, opacity * 0.9],
            rotateZ: [-1, 2, -1],
          }}
          transition={{
            duration: 7,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 2,
          }}
        />

        {/* Ray 4 */}
        <motion.div
          className="absolute top-0 right-[10%] h-[55%] w-20 origin-top bg-gradient-to-b from-white/12 via-white/3 to-transparent md:w-32"
          style={{
            clipPath: 'polygon(20% 0, 80% 0, 100% 100%, 0% 100%)',
            opacity: opacity * 0.7,
          }}
          animate={{
            opacity: [opacity * 0.7, opacity * 0.4, opacity * 0.7],
            rotateZ: [2, -2, 2],
          }}
          transition={{
            duration: 9,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 3,
          }}
        />
      </div>

      {/* Floating particles */}
      {!isFocusMode && (
        <div className="absolute inset-0">
          {Array.from({ length: 8 }).map((_, i) => (
            <motion.div
              key={i}
              className="absolute h-1 w-1 rounded-full bg-white/30 md:h-1.5 md:w-1.5"
              style={{
                left: `${10 + Math.random() * 80}%`,
                top: `${10 + Math.random() * 80}%`,
              }}
              animate={{
                y: [0, -20, 0],
                x: [0, Math.sin(i) * 15, 0],
                opacity: [0.2, 0.5, 0.2],
              }}
              transition={{
                duration: 5 + Math.random() * 5,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: Math.random() * 3,
              }}
            />
          ))}
        </div>
      )}

      {/* Subtle caustic pattern overlay (light refraction) */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />
    </div>
  );
}
