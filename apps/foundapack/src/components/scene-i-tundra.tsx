'use client';

import { motion } from 'framer-motion';

export function SceneITundra() {
  return (
    <section className="relative flex h-screen flex-col items-center justify-center px-4 text-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 1 }}
        className="max-w-2xl"
      >
        <h2 className="mb-6 font-bold text-5xl text-pack-white md:text-7xl">
          The hardest walk is{' '}
          <span className="text-pack-frost/50">walking alone.</span>
        </h2>
        <p className="text-pack-frost/80 text-xl">
          In the vast tundra of entrepreneurship, isolation is the default
          state.
        </p>
      </motion.div>

      {/* Footprints visual placeholder */}
      <div className="absolute bottom-20 opacity-20">
        <div className="text-6xl">👣</div>
      </div>
    </section>
  );
}
