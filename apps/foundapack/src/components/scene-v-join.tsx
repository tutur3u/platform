'use client';

import { motion } from 'framer-motion';

export function SceneVJoin() {
  return (
    <section className="relative flex min-h-[60vh] flex-col items-center justify-center overflow-hidden bg-pack-void px-4 py-20">
      {/* Ambient Background Glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom,rgba(251,191,36,0.15)_0%,transparent_60%)]" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="relative z-10 text-center"
      >
        <h2 className="mb-6 font-bold text-4xl text-pack-white">
          The fire is lit.
        </h2>

        <p className="mx-auto mb-12 max-w-xl text-pack-frost/70 text-xl">
          The pack is gathering. All that's missing is you.
        </p>

        <a
          href="mailto:contact@tuturuuu.com"
          className="group relative inline-flex items-center gap-2 rounded-full px-8 py-4 font-bold text-lg text-pack-white transition-transform duration-200 hover:scale-105"
        >
          {/* Molten Core Button Styles */}
          <div className="absolute inset-0 rounded-full bg-linear-to-r from-pack-orange to-pack-amber opacity-90 blur-sm transition-opacity group-hover:opacity-100 group-hover:blur-md" />
          <div className="absolute inset-0 rounded-full border border-white/20 bg-linear-to-r from-pack-orange to-pack-amber" />

          <span className="relative z-10 flex items-center gap-2 text-shadow-sm">
            Join the Pack
            <span className="transition-transform group-hover:translate-x-1">
              →
            </span>
          </span>
        </a>
      </motion.div>
    </section>
  );
}
