'use client';

import { motion } from 'framer-motion';
import { CORE_MEMBERS, VENTURES } from '@/lib/constants';
import { MemberCard } from './member-card';

export function TheCouncil() {
  return (
    <section className="relative overflow-hidden px-4 py-32">
      <div className="pack-texture-overlay opacity-5" />

      <div className="relative z-10 mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-20 text-center"
        >
          <span className="mb-4 inline-block font-mono text-pack-amber text-xs uppercase tracking-[0.4em]">
            The Alpha Pack
          </span>
          <h2 className="pack-font-serif mb-6 font-bold text-5xl text-pack-white md:text-7xl">
            The Council
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-pack-frost/60">
            A collective of visionaries and builders, united at the campfire to
            forge the future of human progress.
          </p>
        </motion.div>

        <div className="space-y-32">
          {VENTURES.map((venture, ventureIndex) => {
            const members = CORE_MEMBERS.filter(
              (m) => m.venture === venture.name
            );

            return (
              <motion.div
                key={venture.id}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-100px' }}
                transition={{ duration: 0.8, delay: ventureIndex * 0.2 }}
              >
                <div className="mb-12 flex flex-col justify-between gap-6 border-pack-border/20 border-b pb-8 md:flex-row md:items-end">
                  <div>
                    <h3 className="pack-font-serif mb-2 font-bold text-3xl text-pack-white tracking-tight">
                      {venture.name}
                    </h3>
                    <p className="text-pack-frost/40 text-sm uppercase tracking-widest">
                      Project Territory
                    </p>
                  </div>
                  <a
                    href={venture.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group inline-flex items-center gap-2 font-medium text-pack-amber transition-colors hover:text-pack-gold"
                  >
                    Visit {venture.name}
                    <span className="transition-transform group-hover:translate-x-1">
                      →
                    </span>
                  </a>
                </div>

                <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
                  {members.map((member, i) => (
                    <motion.div
                      key={member.name}
                      initial={{ opacity: 0, scale: 0.9 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.5, delay: i * 0.1 }}
                    >
                      <MemberCard member={member} />
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Background Decorative Glows */}
      <div className="pointer-events-none absolute top-1/4 left-0 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-pack-amber/5 blur-[120px]" />
      <div className="pointer-events-none absolute right-0 bottom-1/4 h-[500px] w-[500px] translate-x-1/2 rounded-full bg-pack-orange/5 blur-[120px]" />
    </section>
  );
}
