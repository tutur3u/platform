'use client';

import { cn } from '@tuturuuu/utils/format';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';

export function SceneITundra() {
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end start'],
  });

  const titleY = useTransform(scrollYProgress, [0, 1], [0, 100]);
  const titleOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const subtitleY = useTransform(scrollYProgress, [0, 1], [0, 50]);

  return (
    <section
      ref={sectionRef}
      className="relative flex h-screen flex-col items-center justify-center overflow-hidden px-4 text-center"
    >
      {/* Animated gradient orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-pack-amber/10 blur-[100px]"
          animate={{
            x: [0, 50, 0],
            y: [0, 30, 0],
            scale: [1, 1.1, 1],
          }}
          transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute right-1/4 -bottom-32 h-96 w-96 rounded-full bg-pack-orange/10 blur-[100px]"
          animate={{
            x: [0, -50, 0],
            y: [0, -30, 0],
            scale: [1, 1.2, 1],
          }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      {/* Floating particles */}
      <div className="pointer-events-none absolute inset-0">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute h-1 w-1 rounded-full bg-pack-amber/30"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{
              y: [0, -30, 0],
              opacity: [0.2, 0.6, 0.2],
            }}
            transition={{
              duration: 3 + Math.random() * 2,
              repeat: Infinity,
              delay: Math.random() * 2,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>

      {/* Main content */}
      <motion.div
        style={{ y: titleY, opacity: titleOpacity }}
        className="relative z-10 max-w-5xl"
      >
        {/* Scene badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.8 }}
          className="mb-8 flex justify-center"
        >
          <span
            className={cn(
              'inline-flex items-center gap-2 rounded-full border border-pack-amber/30 bg-pack-amber/5 px-5 py-2',
              'font-mono text-pack-amber text-xs uppercase tracking-[0.4em]',
              'shadow-[0_0_30px_rgba(251,191,36,0.1)]'
            )}
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-pack-amber" />
            Scene I: The Isolation
          </span>
        </motion.div>

        {/* Main headline */}
        <motion.h1
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 1, ease: 'easeOut' }}
          className="pack-font-serif mb-10 font-bold text-6xl leading-[1.1] tracking-tight md:text-8xl lg:text-9xl"
        >
          <span className="block text-pack-white">The hardest walk is </span>
          <motion.span
            className="relative mt-2 block text-orange-200 italic"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1, duration: 1 }}
          >
            walking alone.
            {/* Underline glow */}
            <motion.span
              className="absolute -bottom-2 left-1/2 h-px -translate-x-1/2 bg-linear-to-r from-transparent via-pack-amber/50 to-transparent"
              initial={{ width: 0 }}
              animate={{ width: '80%' }}
              transition={{ delay: 1.5, duration: 1.2 }}
            />
          </motion.span>
        </motion.h1>

        {/* Subtext */}
        <motion.div
          style={{ y: subtitleY }}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 1 }}
          className="mx-auto max-w-2xl"
        >
          <p className="mb-4 text-pack-frost/70 text-xl leading-relaxed md:text-2xl">
            In the vast tundra of entrepreneurship,
          </p>
          <motion.span
            className="pack-font-handwritten relative inline-block text-3xl text-pack-amber md:text-4xl"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 1.2, duration: 0.8 }}
          >
            isolation is the default state.
            <motion.span
              className="absolute -bottom-3 left-0 h-0.5 w-full origin-left bg-pack-amber/40"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 1.8, duration: 0.8 }}
            />
          </motion.span>
        </motion.div>
      </motion.div>

      {/* Animated wolf tracks leading upward */}
      <div className="pointer-events-none absolute bottom-20 left-1/2 -translate-x-1/2">
        <svg width="120" height="300" viewBox="0 0 120 300" fill="none">
          <title>Wolf Tracks</title>
          {[
            { x: 40, y: 280, delay: 0 },
            { x: 70, y: 220, delay: 0.6 },
            { x: 45, y: 160, delay: 1.2 },
            { x: 65, y: 100, delay: 1.8 },
            { x: 50, y: 40, delay: 2.4 },
          ].map((track, i) => (
            <motion.g key={i}>
              {/* Paw print shape */}
              <motion.ellipse
                cx={track.x}
                cy={track.y}
                rx="12"
                ry="8"
                initial={{ opacity: 0, scale: 0 }}
                animate={{
                  opacity: [0, 0.8, 0.3],
                  scale: [0.5, 1, 1],
                }}
                transition={{
                  duration: 3,
                  delay: track.delay,
                  repeat: Infinity,
                  repeatDelay: 3,
                }}
                fill="url(#trackGradient)"
              />
              {/* Toe prints */}
              {[
                { dx: -8, dy: -10 },
                { dx: 0, dy: -12 },
                { dx: 8, dy: -10 },
              ].map((toe, j) => (
                <motion.circle
                  key={j}
                  cx={track.x + toe.dx}
                  cy={track.y + toe.dy}
                  r="3"
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{
                    opacity: [0, 0.6, 0.2],
                    scale: [0.5, 1, 1],
                  }}
                  transition={{
                    duration: 3,
                    delay: track.delay + 0.1,
                    repeat: Infinity,
                    repeatDelay: 3,
                  }}
                  fill="url(#trackGradient)"
                />
              ))}
            </motion.g>
          ))}
          <defs>
            <radialGradient id="trackGradient">
              <stop offset="0%" stopColor="var(--color-pack-amber)" />
              <stop
                offset="100%"
                stopColor="var(--color-pack-amber)"
                stopOpacity="0"
              />
            </radialGradient>
          </defs>
        </svg>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.5, duration: 1 }}
        className="absolute bottom-8 flex flex-col items-center gap-3"
      >
        <motion.span
          className="text-pack-frost/40 text-xs uppercase tracking-[0.3em]"
          animate={{ opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          Begin the hunt
        </motion.span>
        <motion.div
          className="flex h-10 w-6 items-start justify-center rounded-full border border-pack-frost/20 p-1.5"
          animate={{
            borderColor: [
              'rgba(255,255,255,0.1)',
              'rgba(251,191,36,0.3)',
              'rgba(255,255,255,0.1)',
            ],
          }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <motion.div
            className="h-2 w-1 rounded-full bg-pack-amber"
            animate={{ y: [0, 12, 0], opacity: [1, 0.5, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        </motion.div>
      </motion.div>
    </section>
  );
}
