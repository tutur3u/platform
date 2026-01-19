'use client';

import { motion } from 'framer-motion';
import { DataFire } from './data-fire';

export function SceneIIICampfire() {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-pack-charcoal/30 to-pack-void/80 px-4 py-20">
      {/* Campfire glow center (Pulse) */}
      <motion.div
        animate={{ opacity: [0.3, 0.5, 0.3], scale: [1, 1.05, 1] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        className="pointer-events-none absolute top-1/2 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-pack-amber/5 blur-[100px]"
      />

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
          {/* Replaced Ring with DataFire */}
          <div className="absolute inset-0 scale-150 transform">
            <DataFire />
          </div>

          <div className="relative z-10 text-center">
            <p className="mb-2 font-mono text-pack-amber drop-shadow-[0_0_10px_rgba(251,191,36,0.5)]">
              2026 EXPEDITION
            </p>
            <div className="font-bold text-4xl text-pack-white drop-shadow-lg">
              JAN - JUN
            </div>
            <p className="mt-2 text-pack-frost/50 text-sm">
              Phase I: Foundation
            </p>

            {/* Holographic Scanline */}
            <div className="pack-scan-line pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-pack-amber/20 to-transparent opacity-10" />
          </div>
        </div>
      </motion.div>
    </section>
  );
}
