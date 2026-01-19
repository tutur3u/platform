'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import { VENTURES } from '@/lib/constants';

export function SceneIVHunt() {
  return (
    <section
      id="metrics"
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-pack-void px-4 py-32"
    >
      <div className="pack-texture-overlay opacity-5" />

      {/* Dynamic Background */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,var(--tw-gradient-stops))] from-pack-slate/40 via-pack-void to-pack-void opacity-50" />

      {/* Constellation Mesh Background (Subtle connections between cards) */}
      <svg
        className="pointer-events-none absolute inset-0 z-0 h-full w-full opacity-20"
        aria-hidden="true"
      >
        <motion.path
          d="M 20% 60% Q 50% 40% 80% 60%"
          fill="none"
          stroke="var(--color-pack-amber)"
          strokeWidth="1"
          strokeDasharray="4 4"
          initial={{ pathLength: 0, opacity: 0 }}
          whileInView={{ pathLength: 1, opacity: 0.3 }}
          transition={{ duration: 2 }}
        />
        <motion.circle cx="20%" cy="60%" r="2" fill="var(--color-pack-amber)" />
        <motion.circle cx="50%" cy="40%" r="2" fill="var(--color-pack-amber)" />
        <motion.circle cx="80%" cy="60%" r="2" fill="var(--color-pack-amber)" />
      </svg>

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
        className="relative z-10 max-w-6xl text-center"
      >
        <span className="mb-6 inline-block rounded-full border border-pack-amber/20 bg-pack-amber/5 px-4 py-1.5 font-mono text-pack-amber text-sm tracking-wider">
          PROJECT TERRITORY
        </span>

        <h2 className="pack-font-serif mb-8 font-bold text-5xl text-pack-white tracking-tight md:text-7xl">
          Pack Emblems
        </h2>

        <p className="mx-auto mb-20 max-w-2xl text-pack-frost/60 text-xl">
          The territory we've claimed. Each emblem represents a fire we've lit
          in the vast tundra of human progress.
        </p>

        <div className="grid grid-cols-1 gap-12 md:grid-cols-3">
          {VENTURES.map((venture, i) => (
            <motion.a
              key={venture.id}
              href={venture.url}
              target="_blank"
              rel="noopener noreferrer"
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: i * 0.1 }}
              className="group relative"
            >
              {/* Rugged Border/Frame */}
              <div className="relative aspect-4/3 w-full overflow-hidden rounded-2xl border border-pack-border/30 bg-pack-charcoal transition-all duration-500 group-hover:border-pack-amber/50 group-hover:shadow-[0_0_30px_rgba(251,191,36,0.1)]">
                <Image
                  src={venture.previewUrl}
                  alt={venture.name}
                  fill
                  className="h-full w-full object-cover opacity-60 transition-all duration-700 group-hover:scale-110 group-hover:opacity-100"
                />

                {/* Overlay Vignette */}
                <div className="absolute inset-0 bg-linear-to-t from-pack-void via-transparent to-transparent opacity-80" />

                {/* Texture */}
                <div className="pack-texture-overlay opacity-10" />

                {/* Content Overlay */}
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                  <h3 className="pack-font-serif mb-2 translate-y-4 font-bold text-2xl text-pack-white opacity-0 transition-opacity duration-500 group-hover:translate-y-0 group-hover:opacity-100">
                    {venture.name}
                  </h3>
                  <div className="h-px w-0 bg-pack-amber transition-all duration-500 group-hover:w-12" />
                </div>
              </div>

              {/* Base Label (Always Visible) */}
              <div className="mt-6 text-center">
                <span className="font-mono text-pack-frost/40 text-xs uppercase tracking-[0.3em] transition-colors group-hover:text-pack-amber">
                  {venture.name}
                </span>
              </div>
            </motion.a>
          ))}
        </div>
      </motion.div>
    </section>
  );
}
