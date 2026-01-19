'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function WolfSilhouette() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <div className="h-72 w-72 md:h-[500px] md:w-[500px]" />;

  return (
    <div className="relative flex h-72 w-72 items-center justify-center md:h-[500px] md:w-[500px]">
      {/* Intense Center Glow for Visibility */}
      <div className="absolute inset-0 rounded-full bg-pack-amber/10 blur-[100px]" />
      <div className="absolute h-32 w-32 rounded-full bg-pack-orange/20 blur-[60px]" />

      {/* Dynamic Background Glow */}
      <motion.div
        animate={{
          opacity: [0.2, 0.4, 0.2],
          scale: [1, 1.1, 1],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute inset-0 rounded-full bg-pack-amber/20 blur-[120px]"
      />

      <svg
        viewBox="0 0 400 400"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="relative z-10 h-full w-full drop-shadow-[0_0_30px_rgba(251,191,36,0.2)]"
      >
        <title>Spectral Wolf Silhouette</title>
        <defs>
          <filter id="wolf-glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <linearGradient
            id="wolf-grad"
            x1="200"
            y1="50"
            x2="200"
            y2="350"
            gradientUnits="userSpaceOnUse"
          >
            <stop
              offset="0%"
              stopColor="var(--color-pack-amber)"
              stopOpacity="0.8"
            />
            <stop
              offset="50%"
              stopColor="var(--color-pack-orange)"
              stopOpacity="0.4"
            />
            <stop
              offset="100%"
              stopColor="var(--color-pack-void)"
              stopOpacity="0"
            />
          </linearGradient>
        </defs>

        {/* The Spectral Wolf Silhouette */}
        <motion.path
          d="M200 60 
             C 240 60, 280 90, 290 140 
             C 290 180, 270 220, 240 250 
             L 250 340 
             L 200 320 
             L 150 340 
             L 160 250 
             C 130 220, 110 180, 110 140 
             C 120 90, 160 60, 200 60 Z"
          fill="rgba(251, 191, 36, 0.05)"
          stroke="var(--color-pack-amber)"
          strokeWidth="1"
          filter="url(#wolf-glow)"
          animate={{
            strokeOpacity: [0.4, 1, 0.4],
            fillOpacity: [0.05, 0.1, 0.05],
            scale: [1, 1.01, 1],
          }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Noble Ears */}
        <path
          d="M170 85 L140 20 L190 75 M230 85 L260 20 L210 75"
          fill="rgba(251, 191, 36, 0.05)"
          stroke="var(--color-pack-amber)"
          strokeWidth="1"
          strokeLinejoin="round"
        />

        {/* Celestial Eyes - Brighter */}
        <motion.g
          animate={{
            opacity: [0.6, 1, 0.6],
            scale: [1, 1.2, 1],
          }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        >
          <circle cx="175" cy="150" r="2.5" fill="var(--color-pack-amber)" />
          <circle cx="225" cy="150" r="2.5" fill="var(--color-pack-amber)" />
          <circle
            cx="175"
            cy="150"
            r="8"
            fill="var(--color-pack-amber)"
            opacity="0.3"
          />
          <circle
            cx="225"
            cy="150"
            r="8"
            fill="var(--color-pack-amber)"
            opacity="0.3"
          />
        </motion.g>

        {/* Floating Ember Particles Around Wolf */}
        {[...Array(12)].map((_, i) => {
          const r = 0.5 + (i % 3) * 0.5;
          const cx = 200 + (((i * 17) % 200) - 100);
          const cy = 200 + (((i * 23) % 200) - 100);
          const duration = 4 + (i % 4);

          return (
            <motion.circle
              key={i}
              r={r}
              fill="var(--color-pack-amber)"
              initial={{
                cx,
                cy,
                opacity: 0,
              }}
              animate={{
                cy: [cy, cy - 100],
                opacity: [0, 0.6, 0],
              }}
              transition={{
                duration,
                repeat: Infinity,
                delay: i * 0.5,
              }}
            />
          );
        })}
      </svg>

      {/* Internal Stars (Constellation inside the silhouette) */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="relative h-1/2 w-1/3">
          {[...Array(8)].map((_, i) => {
            const left = (i * 37) % 100;
            const top = (i * 43) % 100;
            const duration = 2 + (i % 3);

            return (
              <motion.div
                key={i}
                className="absolute h-1 w-1 rounded-full bg-pack-amber"
                style={{
                  left: `${left}%`,
                  top: `${top}%`,
                }}
                animate={{
                  opacity: [0.2, 0.8, 0.2],
                  scale: [1, 1.5, 1],
                }}
                transition={{
                  duration,
                  repeat: Infinity,
                  delay: i * 0.3,
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
