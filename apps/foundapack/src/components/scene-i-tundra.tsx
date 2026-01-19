'use client';

import { motion } from 'framer-motion';

export function SceneITundra() {
  return (
    <section className="relative flex h-screen flex-col items-center justify-center px-4 text-center overflow-hidden">
      <div className="pack-texture-overlay" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
        className="relative z-10 max-w-3xl"
      >
        <motion.span
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 0.4 }}
          transition={{ delay: 0.5, duration: 1 }}
          className="mb-4 block font-mono text-xs uppercase tracking-[0.3em] text-pack-amber"
        >
          Scene I: The Isolation
        </motion.span>

        <h2 className="mb-8 font-bold text-6xl text-pack-white md:text-8xl pack-font-serif leading-tight">
          The hardest walk is <br />
          <span className="text-pack-frost/30 italic">walking alone.</span>
        </h2>

        <div className="relative mx-auto max-w-xl">
          <p className="text-pack-frost/80 text-xl md:text-2xl leading-relaxed">
            In the vast tundra of entrepreneurship, <br />
            <span className="pack-font-handwritten text-pack-amber/80 text-3xl">
              isolation is the default state.
            </span>
          </p>
        </div>
      </motion.div>

      {/* Animated Footprints */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 opacity-10 pointer-events-none">
        <svg width="200" height="400" viewBox="0 0 200 400" fill="none">
          <motion.path
            d="M80 350C80 350 70 340 70 330C70 320 80 315 85 315C90 315 100 320 100 330C100 340 90 350 80 350Z"
            fill="currentColor"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          />
          <motion.path
            d="M120 280C120 280 130 270 130 260C130 250 120 245 115 245C110 245 100 250 100 260C100 270 110 280 120 280Z"
            fill="currentColor"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          />
          <motion.path
            d="M80 210C80 210 70 200 70 190C70 180 80 175 85 175C90 175 100 180 100 190C100 200 90 210 80 210Z"
            fill="currentColor"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          />
          <motion.path
            d="M120 140C120 140 130 130 130 120C130 110 120 105 115 105C110 105 100 110 100 120C100 130 110 140 120 140Z"
            fill="currentColor"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
          />
        </svg>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        transition={{ delay: 1.5, duration: 1 }}
        className="absolute bottom-12 flex flex-col items-center gap-2"
      >
        <span className="text-xs uppercase tracking-widest text-pack-frost/30">
          Scroll to explore
        </span>
        <div className="h-12 w-px bg-gradient-to-b from-pack-amber/50 to-transparent animate-pulse" />
      </motion.div>
    </section>
  );
}
