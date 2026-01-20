'use client';

import { cn } from '@tuturuuu/utils/format';
import { motion, useScroll, useTransform } from 'framer-motion';
import { memo, useEffect, useMemo, useRef, useState } from 'react';

// ============================================================================
// TYPES
// ============================================================================
interface Particle {
  id: number;
  left: string;
  top: string;
  duration: number;
  delay: number;
  size: number;
  brightness: number;
}

// ============================================================================
// CONSTANTS - Hoisted outside component to prevent recreation
// ============================================================================
const PARTICLE_COUNT = 50;
const EMBER_COUNT = 35;
const BIG_EMBER_COUNT = 6;

// Deterministic seed-based pseudo-random generator to avoid hydration mismatches
const seededRandom = (seed: number) => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

// Pre-generate particles with deterministic values
const generateParticles = (
  count: number,
  type: 'particle' | 'ember'
): Particle[] =>
  Array.from({ length: count }, (_, i) => {
    const seed = type === 'particle' ? i * 13 : i * 17 + 1000;
    return {
      id: i,
      left:
        type === 'particle'
          ? `${10 + seededRandom(seed) * 80}%`
          : `${8 + seededRandom(seed) * 84}%`,
      top:
        type === 'particle'
          ? `${25 + seededRandom(seed + 1) * 55}%`
          : `${90 + seededRandom(seed + 1) * 10}%`,
      duration:
        type === 'particle'
          ? 6 + seededRandom(seed + 2) * 4
          : 8 + seededRandom(seed + 2) * 6,
      delay: seededRandom(seed + 3) * 8,
      size:
        type === 'particle'
          ? 2 + seededRandom(seed + 4) * 2.5
          : 3 + seededRandom(seed + 4) * 3,
      brightness:
        type === 'particle'
          ? 0.5 + seededRandom(seed + 5) * 0.4
          : 0.7 + seededRandom(seed + 5) * 0.3,
    };
  });

// Static particle/ember data - computed once at module level
const PARTICLES = generateParticles(PARTICLE_COUNT, 'particle');
const EMBERS = generateParticles(EMBER_COUNT, 'ember');

// Wolf track positions - static data
const WOLF_TRACKS = [
  { x: 40, y: 280, delay: 0 },
  { x: 70, y: 220, delay: 0.6 },
  { x: 45, y: 160, delay: 1.2 },
  { x: 65, y: 100, delay: 1.8 },
  { x: 50, y: 40, delay: 2.4 },
] as const;

const TOE_OFFSETS = [
  { dx: -8, dy: -10 },
  { dx: 0, dy: -12 },
  { dx: 8, dy: -10 },
] as const;

// Reusable animation configs - hoisted to prevent object recreation
const PULSING_GLOW_ANIMATION = {
  opacity: [0.6, 1, 0.6],
  scale: [1, 1.08, 1],
};

const PULSING_GLOW_TRANSITION = {
  duration: 2.5,
  repeat: Infinity,
  ease: 'easeInOut' as const,
};

// ============================================================================
// MEMOIZED SUB-COMPONENTS
// ============================================================================

// Campfire glow - static gradient + one animated element
const CampfireGlow = memo(function CampfireGlow() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute bottom-0 left-1/2 h-[80vh] w-[150vw] -translate-x-1/2 bg-[radial-gradient(ellipse_80%_50%_at_50%_100%,rgba(251,191,36,0.4)_0%,rgba(249,115,22,0.25)_25%,rgba(239,68,68,0.1)_45%,transparent_70%)]" />
      <motion.div
        className="absolute bottom-0 left-1/2 h-[60vh] w-screen -translate-x-1/2 bg-[radial-gradient(ellipse_60%_40%_at_50%_100%,rgba(251,191,36,0.5)_0%,rgba(249,115,22,0.2)_40%,transparent_70%)]"
        animate={PULSING_GLOW_ANIMATION}
        transition={PULSING_GLOW_TRANSITION}
      />
    </div>
  );
});

// Animated gradient orbs - extracted for memoization
const GradientOrbs = memo(function GradientOrbs() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute -top-20 left-1/4 h-150 w-150 rounded-full bg-pack-amber/30 blur-[150px]"
        animate={{
          x: [0, 80, 0],
          y: [0, 50, 0],
          scale: [1, 1.2, 1],
          opacity: [0.5, 0.8, 0.5],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute right-1/4 -bottom-20 h-137.5 w-137.5 rounded-full bg-pack-orange/35 blur-[120px]"
        animate={{
          x: [0, -70, 0],
          y: [0, -50, 0],
          scale: [1, 1.25, 1],
          opacity: [0.4, 0.75, 0.4],
        }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute top-1/2 left-1/2 h-100 w-150 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pack-gold/20 blur-[100px]"
        animate={{
          scale: [1, 1.4, 1],
          opacity: [0.3, 0.6, 0.3],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
      <motion.div
        className="absolute bottom-1/4 left-1/3 h-50 w-50 rounded-full bg-pack-ember/20 blur-[60px]"
        animate={{
          scale: [1, 1.5, 1],
          opacity: [0.3, 0.6, 0.3],
          x: [0, 30, 0],
        }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute right-1/3 bottom-1/3 h-45 w-45 rounded-full bg-pack-amber/25 blur-[50px]"
        animate={{
          scale: [1, 1.4, 1],
          opacity: [0.4, 0.7, 0.4],
          x: [0, -25, 0],
        }}
        transition={{
          duration: 5,
          repeat: Infinity,
          ease: 'easeInOut',
          delay: 1,
        }}
      />
    </div>
  );
});

// Single floating particle - memoized to prevent unnecessary re-renders
const FloatingParticle = memo(function FloatingParticle({
  particle,
}: {
  particle: Particle;
}) {
  const style = useMemo(
    () => ({
      left: particle.left,
      top: particle.top,
      width: particle.size * 1.5,
      height: particle.size * 1.5,
      background:
        'radial-gradient(circle, rgba(255,220,100,1) 0%, rgba(251,191,36,0.8) 40%, transparent 70%)',
      boxShadow: `0 0 ${particle.size * 8}px rgba(251, 191, 36, ${particle.brightness + 0.2})`,
    }),
    [particle.left, particle.top, particle.size, particle.brightness]
  );

  const animate = useMemo(
    () => ({
      y: [0, -20, 0],
      x: [0, (particle.id % 2 === 0 ? 1 : -1) * 8, 0],
      opacity: [0.4, particle.brightness + 0.2, 0.4],
      scale: [0.9, 1.15, 0.9],
    }),
    [particle.id, particle.brightness]
  );

  const transition = useMemo(
    () => ({
      duration: particle.duration * 2.5,
      repeat: Infinity,
      delay: particle.delay,
      ease: 'easeInOut' as const,
    }),
    [particle.duration, particle.delay]
  );

  return (
    <motion.div
      className="absolute rounded-full"
      style={style}
      animate={animate}
      transition={transition}
    />
  );
});

// Floating particles container
const FloatingParticles = memo(function FloatingParticles() {
  return (
    <div className="pointer-events-none absolute inset-0">
      {PARTICLES.map((particle) => (
        <FloatingParticle key={particle.id} particle={particle} />
      ))}
    </div>
  );
});

// Single rising ember - memoized
const RisingEmber = memo(function RisingEmber({
  ember,
  viewportHeight,
}: {
  ember: Particle;
  viewportHeight: number;
}) {
  const xDrift = (ember.id % 2 === 0 ? 1 : -1) * (20 + (ember.id % 5) * 8);

  const style = useMemo(
    () => ({
      left: ember.left,
      bottom: 0,
      width: ember.size * 1.2,
      height: ember.size * 1.2,
      background: `radial-gradient(circle, rgba(255,230,100,1) 0%, rgba(251,191,36,1) 30%, rgba(249,115,22,0.8) 60%, transparent 100%)`,
      boxShadow: `0 0 ${ember.size * 8}px rgba(251, 191, 36, ${ember.brightness}), 0 0 ${ember.size * 15}px rgba(249, 115, 22, ${ember.brightness * 0.5})`,
    }),
    [ember.left, ember.size, ember.brightness]
  );

  const animate = useMemo(
    () => ({
      y: [0, -viewportHeight * 1.2],
      x: [0, xDrift * 0.5, xDrift],
      opacity: [0, 0.8, 0.9, 0.7, 0],
      scale: [0.4, 1, 1, 0.8, 0.3],
    }),
    [viewportHeight, xDrift]
  );

  const transition = useMemo(
    () => ({
      duration: ember.duration * 1.5,
      repeat: Infinity,
      delay: ember.delay,
      ease: 'linear' as const,
    }),
    [ember.duration, ember.delay]
  );

  return (
    <motion.div
      className="absolute rounded-full"
      style={style}
      animate={animate}
      transition={transition}
    />
  );
});

// Rising embers container
const RisingEmbers = memo(function RisingEmbers({
  viewportHeight,
}: {
  viewportHeight: number;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {EMBERS.map((ember) => (
        <RisingEmber
          key={`ember-${ember.id}`}
          ember={ember}
          viewportHeight={viewportHeight}
        />
      ))}
    </div>
  );
});

// Big ember - memoized
const BigEmber = memo(function BigEmber({
  index,
  viewportHeight,
}: {
  index: number;
  viewportHeight: number;
}) {
  const xDrift = (index % 2 === 0 ? 1 : -1) * (30 + index * 8);

  const style = useMemo(
    () => ({
      left: `${18 + index * 12}%`,
      bottom: 0,
      width: 6 + (index % 3) * 2,
      height: 6 + (index % 3) * 2,
      background:
        'radial-gradient(circle, rgba(255,240,150,1) 0%, rgba(251,191,36,0.9) 40%, rgba(249,115,22,0.6) 70%, transparent 100%)',
      boxShadow: `0 0 25px rgba(251, 191, 36, 0.7), 0 0 50px rgba(249, 115, 22, 0.35)`,
    }),
    [index]
  );

  const animate = useMemo(
    () => ({
      y: [0, -viewportHeight * 1.3],
      x: [0, xDrift * 0.5, xDrift],
      opacity: [0, 0.9, 1, 0.9, 0],
      scale: [0.5, 0.9, 1, 0.85, 0.4],
    }),
    [viewportHeight, xDrift]
  );

  const transition = useMemo(
    () => ({
      duration: 18 + index * 3,
      repeat: Infinity,
      delay: index * 2.5,
      ease: 'linear' as const,
    }),
    [index]
  );

  return (
    <motion.div
      className="absolute rounded-full"
      style={style}
      animate={animate}
      transition={transition}
    />
  );
});

// Big embers container
const BigEmbers = memo(function BigEmbers({
  viewportHeight,
}: {
  viewportHeight: number;
}) {
  const indices = useMemo(
    () => Array.from({ length: BIG_EMBER_COUNT }, (_, i) => i),
    []
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {indices.map((i) => (
        <BigEmber
          key={`big-ember-${i}`}
          index={i}
          viewportHeight={viewportHeight}
        />
      ))}
    </div>
  );
});

// Wolf track component - memoized with stable animation config
const WolfTrack = memo(function WolfTrack({
  track,
}: {
  track: (typeof WOLF_TRACKS)[number];
}) {
  const trackAnimation = useMemo(
    () => ({
      opacity: [0, 0.8, 0.3],
      scale: [0.5, 1, 1],
    }),
    []
  );

  const trackTransition = useMemo(
    () => ({
      duration: 3,
      delay: track.delay,
      repeat: Infinity,
      repeatDelay: 3,
    }),
    [track.delay]
  );

  const toeTransition = useMemo(
    () => ({
      duration: 3,
      delay: track.delay + 0.1,
      repeat: Infinity,
      repeatDelay: 3,
    }),
    [track.delay]
  );

  const toeAnimation = useMemo(
    () => ({
      opacity: [0, 0.6, 0.2],
      scale: [0.5, 1, 1],
    }),
    []
  );

  return (
    <motion.g>
      <motion.ellipse
        cx={track.x}
        cy={track.y}
        rx="12"
        ry="8"
        initial={{ opacity: 0, scale: 0 }}
        animate={trackAnimation}
        transition={trackTransition}
        fill="url(#trackGradient)"
      />
      {TOE_OFFSETS.map((toe, j) => (
        <motion.circle
          key={j}
          cx={track.x + toe.dx}
          cy={track.y + toe.dy}
          r="3"
          initial={{ opacity: 0, scale: 0 }}
          animate={toeAnimation}
          transition={toeTransition}
          fill="url(#trackGradient)"
        />
      ))}
    </motion.g>
  );
});

// Wolf tracks SVG - memoized
const WolfTracks = memo(function WolfTracks() {
  return (
    <div className="pointer-events-none absolute bottom-20 left-1/2 -translate-x-1/2">
      <svg width="120" height="300" viewBox="0 0 120 300" fill="none">
        <title>Wolf Tracks</title>
        {WOLF_TRACKS.map((track, i) => (
          <WolfTrack key={i} track={track} />
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
  );
});

// Scroll indicator - memoized
const ScrollIndicator = memo(function ScrollIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 2.5, duration: 1 }}
      className="absolute bottom-8 flex flex-col items-center gap-3"
    >
      <motion.span
        className="text-pack-amber/60 text-xs uppercase tracking-[0.3em]"
        animate={{
          opacity: [0.4, 0.8, 0.4],
          textShadow: [
            '0 0 10px rgba(251, 191, 36, 0)',
            '0 0 10px rgba(251, 191, 36, 0.3)',
            '0 0 10px rgba(251, 191, 36, 0)',
          ],
        }}
        transition={{ duration: 2.5, repeat: Infinity }}
      >
        Begin the journey
      </motion.span>
      <motion.div
        className="flex h-10 w-6 items-start justify-center rounded-full border border-pack-amber/30 bg-pack-amber/5 p-1.5"
        animate={{
          borderColor: [
            'rgba(251,191,36,0.2)',
            'rgba(251,191,36,0.5)',
            'rgba(251,191,36,0.2)',
          ],
          boxShadow: [
            '0 0 15px rgba(251, 191, 36, 0.1)',
            '0 0 25px rgba(251, 191, 36, 0.2)',
            '0 0 15px rgba(251, 191, 36, 0.1)',
          ],
        }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <motion.div
          className="h-2 w-1.5 rounded-full bg-pack-amber"
          animate={{
            y: [0, 14, 0],
            opacity: [1, 0.6, 1],
            boxShadow: [
              '0 0 8px rgba(251, 191, 36, 0.8)',
              '0 0 4px rgba(251, 191, 36, 0.4)',
              '0 0 8px rgba(251, 191, 36, 0.8)',
            ],
          }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      </motion.div>
    </motion.div>
  );
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export function SceneITundra() {
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end start'],
  });

  const titleY = useTransform(scrollYProgress, [0, 1], [0, 100]);
  const titleOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const subtitleY = useTransform(scrollYProgress, [0, 1], [0, 50]);

  // Track viewport height in state to avoid hydration mismatch
  const [viewportHeight, setViewportHeight] = useState(1000);

  useEffect(() => {
    const updateHeight = () => setViewportHeight(window.innerHeight);
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative flex h-screen flex-col items-center justify-center overflow-hidden px-4 text-center"
    >
      {/* Background effects - memoized components */}
      <CampfireGlow />
      <GradientOrbs />
      <FloatingParticles />
      <RisingEmbers viewportHeight={viewportHeight} />
      <BigEmbers viewportHeight={viewportHeight} />

      {/* Main content */}
      <motion.div
        style={{ y: titleY, opacity: titleOpacity }}
        className="relative z-10 max-w-5xl"
      >
        {/* Scene badge with warm glow */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.8 }}
          className="mb-8 flex justify-center"
        >
          <motion.span
            className={cn(
              'inline-flex items-center gap-2 rounded-full border border-pack-amber/40 bg-pack-amber/10 px-5 py-2',
              'font-mono text-pack-amber text-xs uppercase tracking-[0.4em]',
              'shadow-[0_0_40px_rgba(251,191,36,0.2)]'
            )}
            animate={{
              boxShadow: [
                '0 0 40px rgba(251, 191, 36, 0.2)',
                '0 0 60px rgba(251, 191, 36, 0.3)',
                '0 0 40px rgba(251, 191, 36, 0.2)',
              ],
            }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          >
            <motion.span
              className="h-2 w-2 rounded-full bg-pack-amber"
              animate={{
                scale: [1, 1.3, 1],
                opacity: [0.8, 1, 0.8],
                boxShadow: [
                  '0 0 8px rgba(251, 191, 36, 0.6)',
                  '0 0 16px rgba(251, 191, 36, 1)',
                  '0 0 8px rgba(251, 191, 36, 0.6)',
                ],
              }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            />
            Act I — The Gathering
          </motion.span>
        </motion.div>

        {/* Main headline with warm glow */}
        <motion.h1
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 1, ease: 'easeOut' }}
          className="pack-font-serif mb-12 font-bold text-6xl leading-[1.05] tracking-tight md:text-8xl lg:text-9xl"
        >
          <span className="block text-pack-white drop-shadow-[0_0_30px_rgba(255,255,255,0.1)]">
            Find your pack.
          </span>
          <motion.span
            className="relative mt-4 block text-amber-300 italic"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1, duration: 1 }}
            style={{
              textShadow:
                '0 0 40px rgba(251, 191, 36, 0.6), 0 0 80px rgba(249, 115, 22, 0.3)',
            }}
          >
            Ignite your fire.
            {/* Animated underline glow */}
            <motion.span
              className="absolute -bottom-2 left-1/2 h-1 -translate-x-1/2 rounded-full"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: '80%', opacity: 1 }}
              transition={{ delay: 1.5, duration: 1.2 }}
              style={{
                background:
                  'linear-gradient(90deg, transparent 0%, rgba(251,191,36,0.9) 20%, rgba(251,191,36,1) 50%, rgba(251,191,36,0.9) 80%, transparent 100%)',
                boxShadow:
                  '0 0 20px rgba(251, 191, 36, 0.8), 0 0 40px rgba(249, 115, 22, 0.4)',
              }}
            />
          </motion.span>
        </motion.h1>

        {/* Subtext with warmer tones */}
        <motion.div
          style={{ y: subtitleY }}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 1 }}
          className="mx-auto max-w-3xl"
        >
          <p className="text-lg text-pack-frost/70 leading-relaxed md:text-xl">
            Where visionary founders gather around shared warmth
          </p>
          <motion.span
            className="pack-font-handwritten relative inline-block text-2xl text-pack-amber md:text-3xl"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 1.2, duration: 0.8 }}
            style={{
              textShadow: '0 0 30px rgba(251, 191, 36, 0.4)',
            }}
          >
            and the cold fades into memory.
            <motion.span
              className="absolute -bottom-3 left-0 h-0.5 w-full origin-left rounded-full bg-linear-to-r from-pack-amber/60 via-pack-orange/40 to-transparent"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 1.8, duration: 0.8 }}
            />
          </motion.span>
        </motion.div>
      </motion.div>

      {/* Wolf tracks and scroll indicator - memoized */}
      <WolfTracks />
      <ScrollIndicator />
    </section>
  );
}
