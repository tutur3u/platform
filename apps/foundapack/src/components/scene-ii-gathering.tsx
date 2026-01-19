'use client';

import { motion } from 'framer-motion';

export function SceneIIGathering() {
  return (
    <section className="relative flex min-h-[50vh] flex-col items-center justify-center border-pack-border/20 border-y bg-pack-charcoal/30 px-4 py-20 text-center backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        whileInView={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8 }}
        className="max-w-3xl"
      >
        <div className="mb-8 flex justify-center">
          <div className="h-16 w-1 bg-gradient-to-b from-transparent to-pack-amber" />
        </div>

        <h2 className="mb-8 font-bold text-4xl text-pack-white md:text-6xl">
          No student founder <br />
          <span className="text-pack-amber">builds alone.</span>
        </h2>

        <p className="text-lg text-pack-frost/70 leading-relaxed">
          From the shadows, we gather. Turning individual struggles into
          collective power. When we unite, the impossible becomes inevitable.
        </p>
      </motion.div>
    </section>
  );
}
