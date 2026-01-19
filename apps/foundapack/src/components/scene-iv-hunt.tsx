'use client';

import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { VENTURES } from '@/lib/constants';

export function SceneIVHunt() {
  return (
    <section
      id="metrics"
      className="relative min-h-screen overflow-hidden bg-pack-void px-4 py-24 md:py-32"
    >
      {/* Subtle ambient glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/3 left-1/2 h-200 w-200 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pack-amber/[0.03] blur-[150px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="mb-16 text-center md:mb-24"
        >
          <span className="mb-4 inline-block font-mono text-pack-amber/60 text-xs uppercase tracking-[0.4em]">
            The Territory
          </span>
          <h2 className="pack-font-serif mb-4 font-bold text-4xl text-pack-white md:mb-6 md:text-6xl lg:text-7xl">
            Pack Emblems
          </h2>
          <p className="mx-auto max-w-lg text-base text-pack-frost/50 md:text-lg">
            Each emblem represents a fire we've lit in the vast tundra of human
            progress.
          </p>
        </motion.div>

        {/* Ventures Grid */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-8">
          {VENTURES.map((venture, i) => (
            <motion.div
              key={venture.id}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ duration: 0.6, delay: i * 0.15 }}
            >
              <Link
                href={venture.url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'group relative block overflow-hidden rounded-xl',
                  'border border-white/5 bg-pack-charcoal/40',
                  'transition-all duration-500',
                  'hover:border-pack-amber/20 hover:bg-pack-charcoal/60',
                  'hover:shadow-[0_0_40px_rgba(251,191,36,0.08)]'
                )}
              >
                {/* Image */}
                <div className="relative aspect-16/10 w-full overflow-hidden">
                  <Image
                    src={venture.previewUrl}
                    alt={venture.name}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                  {/* Overlay gradient */}
                  <div className="absolute inset-0 bg-linear-to-t from-pack-charcoal via-pack-charcoal/40 to-transparent" />
                </div>

                {/* Content */}
                <div className="p-6">
                  {/* Title */}
                  <h3 className="pack-font-serif mb-3 font-bold text-2xl text-pack-white transition-colors duration-300 group-hover:text-pack-amber">
                    {venture.name}
                  </h3>

                  {/* Divider line */}
                  <div className="mb-4 h-px w-12 bg-pack-amber/30 transition-all duration-500 group-hover:w-20 group-hover:bg-pack-amber" />

                  {/* CTA */}
                  <div className="flex items-center gap-2 text-pack-frost/40 text-sm transition-colors duration-300 group-hover:text-pack-amber/80">
                    <span>Explore</span>
                    <svg
                      className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <title>Explore</title>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 8l4 4m0 0l-4 4m4-4H3"
                      />
                    </svg>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>

        {/* Bottom flourish */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
          className="mt-16 flex justify-center md:mt-24"
        >
          <div className="flex items-center gap-4">
            <div className="h-px w-8 bg-linear-to-r from-transparent to-pack-amber/30" />
            <span className="font-mono text-[10px] text-pack-frost/30 uppercase tracking-[0.3em]">
              {VENTURES.length} Ventures
            </span>
            <div className="h-px w-8 bg-linear-to-l from-transparent to-pack-amber/30" />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
