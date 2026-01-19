'use client';

import { motion } from 'framer-motion';

export function SceneITundra() {
  return (
    <section className="relative flex h-screen flex-col items-center justify-center overflow-hidden px-4 text-center">
      <div className="pack-texture-overlay opacity-10" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
        className="relative z-10 max-w-4xl"
      >
        <motion.span
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 0.6 }}
          transition={{ delay: 0.5, duration: 1 }}
          className="mb-6 block font-mono text-pack-amber text-xs uppercase tracking-[0.4em]"
        >
          Scene I: The Isolation
        </motion.span>

        <h2 className="pack-font-serif mb-8 font-bold text-6xl text-pack-white leading-tight md:text-9xl">
          The hardest walk is <br />
          <span className="text-pack-frost italic opacity-60">
            walking alone.
          </span>
        </h2>

        <div className="relative mx-auto max-w-xl">
          <p className="text-pack-frost/80 text-xl leading-relaxed md:text-2xl">
            In the vast tundra of entrepreneurship, <br />
            <span className="pack-font-handwritten relative inline-block text-3xl text-pack-amber">
              isolation is the default state.
              <motion.span
                className="absolute -bottom-2 left-0 h-px w-full bg-pack-amber/50"
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                transition={{ delay: 1, duration: 0.8 }}
              />
            </span>
          </p>
        </div>
      </motion.div>

      {/* Animated Footprints (Heat Trails) */}
      <div className="pointer-events-none absolute bottom-20 left-1/2 -translate-x-1/2 opacity-30">
        <svg width="200" height="400" viewBox="0 0 200 400" fill="none">
          <title>Animated Heat Trails</title>
          {[
            {
              d: 'M80 350C80 350 70 340 70 330C70 320 80 315 85 315C90 315 100 320 100 330C100 340 90 350 80 350Z',
              delay: 0.2,
            },
            {
              d: 'M120 280C120 280 130 270 130 260C130 250 120 245 115 245C110 245 100 250 100 260C100 270 110 280 120 280Z',
              delay: 1.2,
            }, // Staggered steps
            {
              d: 'M80 210C80 210 70 200 70 190C70 180 80 175 85 175C90 175 100 180 100 190C100 200 90 210 80 210Z',
              delay: 2.2,
            },
            {
              d: 'M120 140C120 140 130 130 130 120C130 110 120 105 115 105C110 105 100 110 100 120C100 130 110 140 120 140Z',
              delay: 3.2,
            },
          ].map((print, i) => (
            <motion.path
              key={i}
              d={print.d}
              initial={{
                fill: 'var(--color-pack-amber)',
                filter: 'drop-shadow(0 0 15px var(--color-pack-amber))',
                opacity: 0,
              }}
              animate={{
                opacity: [0, 1, 0.2],
                fill: [
                  'var(--color-pack-amber)',
                  'var(--color-pack-frost)',
                  'transparent',
                ],
                filter: [
                  'drop-shadow(0 0 20px var(--color-pack-amber))',
                  'drop-shadow(0 0 5px var(--color-pack-frost))',
                  'none',
                ],
              }}
              transition={{
                duration: 4,
                delay: print.delay,
                repeat: Infinity,
                repeatDelay: 2,
              }}
            />
          ))}
        </svg>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        transition={{ delay: 2, duration: 1 }}
        className="absolute bottom-8 flex flex-col items-center gap-2"
      >
        <span className="animate-pulse text-pack-frost/30 text-xs uppercase tracking-widest">
          Begin the hunt
        </span>
        <div className="h-16 w-px bg-gradient-to-b from-pack-amber to-transparent opacity-50" />
      </motion.div>
    </section>
  );
}
