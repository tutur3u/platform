'use client';

import { VENTURES } from '@/lib/constants';
import { motion } from 'framer-motion';

export function SceneIVHunt() {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-pack-void px-4 py-32">
      <div className="pack-texture-overlay opacity-5" />
      
      {/* Dynamic Background */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,_var(--tw-gradient-stops))] from-pack-slate/40 via-pack-void to-pack-void opacity-50" />

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

        <h2 className="mb-8 font-bold text-5xl text-pack-white tracking-tight md:text-7xl pack-font-serif">
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
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-pack-border/30 bg-pack-charcoal transition-all duration-500 group-hover:border-pack-amber/50 group-hover:shadow-[0_0_30px_rgba(251,191,36,0.1)]">
                <img
                  src={venture.previewUrl}
                  alt={venture.name}
                  className="h-full w-full object-cover opacity-60 transition-all duration-700 group-hover:scale-110 group-hover:opacity-100"
                />
                
                {/* Overlay Vignette */}
                <div className="absolute inset-0 bg-gradient-to-t from-pack-void via-transparent to-transparent opacity-80" />
                
                {/* Texture */}
                <div className="pack-texture-overlay opacity-10" />
                
                {/* Content Overlay */}
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                  <h3 className="mb-2 font-bold text-2xl text-pack-white pack-font-serif opacity-0 group-hover:opacity-100 transition-opacity duration-500 translate-y-4 group-hover:translate-y-0">
                    {venture.name}
                  </h3>
                  <div className="h-px w-0 bg-pack-amber transition-all duration-500 group-hover:w-12" />
                </div>
              </div>

              {/* Base Label (Always Visible) */}
              <div className="mt-6 text-center">
                <span className="font-mono text-xs uppercase tracking-[0.3em] text-pack-frost/40 group-hover:text-pack-amber transition-colors">
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
