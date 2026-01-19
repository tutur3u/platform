'use client';

import { motion } from 'framer-motion';

export function SceneIVHunt() {
  return (
    <section className="relative flex min-h-[80vh] flex-col items-center justify-center overflow-hidden bg-pack-void px-4 py-20">
      {/* Dynamic Background */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,_var(--tw-gradient-stops))] from-pack-slate/40 via-pack-void to-pack-void opacity-50" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8 }}
        className="relative z-10 max-w-4xl text-center"
      >
        <span className="mb-6 inline-block rounded-full border border-pack-amber/20 bg-pack-amber/5 px-4 py-1.5 font-mono text-pack-amber text-sm tracking-wider">
          GLOBAL PARTNER NETWORK
        </span>

        <h2 className="mb-8 font-bold text-5xl text-pack-white tracking-tight md:text-7xl">
          Access the <br />
          <span className="bg-gradient-to-r from-[var(--color-pack-amber)] via-[var(--color-pack-gold)] to-[var(--color-pack-orange)] bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(251,191,36,0.3)]">
            Internal Universe
          </span>
        </h2>

        <p className="mx-auto mb-12 max-w-2xl text-pack-frost/70 text-xl">
          This isn't just a club; it's an engine for human progress. Invest in
          the collective force, not just the individual.
        </p>

        {/* Placeholder for Partners/Network */}
        <div className="grid grid-cols-2 gap-4 opacity-50 md:grid-cols-4">
          <div className="flex h-12 items-center justify-center rounded bg-pack-surface/50 font-mono text-pack-frost/50 text-sm">
            VC Network
          </div>
          <div className="flex h-12 items-center justify-center rounded bg-pack-surface/50 font-mono text-pack-frost/50 text-sm">
            Mentors
          </div>
          <div className="flex h-12 items-center justify-center rounded bg-pack-surface/50 font-mono text-pack-frost/50 text-sm">
            Corporate
          </div>
          <div className="flex h-12 items-center justify-center rounded bg-pack-surface/50 font-mono text-pack-frost/50 text-sm">
            Alumni
          </div>
        </div>
      </motion.div>
    </section>
  );
}
