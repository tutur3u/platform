'use client';

import { motion } from 'framer-motion';

export function SceneIIICampfire() {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-pack-charcoal/30 to-pack-void/80 px-4 py-20">
      {/* Campfire glow center */}
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-pack-amber/5 blur-[100px]" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="relative z-10 grid w-full max-w-5xl grid-cols-1 items-center gap-12 md:grid-cols-2"
      >
        <div className="space-y-6 text-left">
          <h3 className="font-bold text-3xl text-pack-white">
            <span className="text-pack-amber">Iron sharpens iron.</span>
          </h3>
          <p className="text-lg text-pack-frost/80">
            We trade scars for wisdom. In our peer-driven sessions, there are no
            gurus—only founders in the trenches, solving real problems together.
          </p>

          <ul className="mt-8 space-y-4">
            <li className="flex items-center gap-3 text-pack-frost">
              <span className="h-2 w-2 rounded-full bg-pack-amber" />
              Peer-to-Peer Sharing
            </li>
            <li className="flex items-center gap-3 text-pack-frost">
              <span className="h-2 w-2 rounded-full bg-pack-amber" />
              Internal Incubation
            </li>
            <li className="flex items-center gap-3 text-pack-frost">
              <span className="h-2 w-2 rounded-full bg-pack-amber" />
              Cross-team Internships
            </li>
          </ul>
        </div>

        {/* Campfire Visual / Map Placeholder */}
        <div className="relative flex aspect-square items-center justify-center rounded-full border border-pack-amber/20 bg-pack-surface/20 backdrop-blur-md">
          <div className="text-center">
            <p className="mb-2 font-mono text-pack-amber">2026 EXPEDITION</p>
            <div className="font-bold text-4xl text-pack-white">JAN - JUN</div>
            <p className="mt-2 text-pack-frost/50 text-sm">
              Phase I: Foundation
            </p>
          </div>

          {/* Animated rings */}
          <motion.div
            className="absolute inset-0 rounded-full border border-pack-amber/10"
            animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 3, repeat: Infinity }}
          />
        </div>
      </motion.div>
    </section>
  );
}
