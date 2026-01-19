'use client';

import { motion } from 'framer-motion';

export function SceneVJoin() {
  return (
    <section className="relative flex min-h-[60vh] flex-col items-center justify-center bg-pack-void px-4 py-20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="text-center"
      >
        <div className="mx-auto mb-8 flex h-20 w-20 animate-pulse items-center justify-center rounded-full bg-pack-amber/20">
          <div className="h-4 w-4 rounded-full bg-pack-amber" />
        </div>

        <h2 className="mb-6 font-bold text-4xl text-pack-white">
          The fire is lit.
        </h2>

        <p className="mx-auto mb-12 max-w-xl text-pack-frost/70 text-xl">
          The pack is gathering. All that's missing is you.
        </p>

        <a
          href="mailto:contact@tuturuuu.com"
          className="inline-flex transform items-center gap-2 rounded-full bg-pack-amber px-8 py-4 font-bold text-lg text-pack-charcoal transition-colors duration-200 hover:scale-105 hover:bg-pack-gold"
        >
          Join the Pack
          <span>→</span>
        </a>
      </motion.div>
    </section>
  );
}
