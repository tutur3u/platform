'use client';

import { GitBranch } from '@tuturuuu/icons/lucide';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Grain } from '../shared/atmosphere';
import { CountUp } from '../shared/count-up';
import { SectionEyebrow } from '../shared/section-shell';

const statKeys = ['years', 'commits', 'contributors', 'potential'] as const;

export function GithubStats() {
  const t = useTranslations('landing.socialProof');

  return (
    <section className="relative px-4 py-20 sm:px-6 sm:py-28 lg:px-8 lg:py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--foreground)_12%,transparent)_25%,color-mix(in_oklab,var(--foreground)_12%,transparent)_75%,transparent)]"
      />

      <div className="mx-auto max-w-5xl">
        <motion.div
          className="relative overflow-hidden rounded-3xl border border-foreground/10 bg-foreground/[0.02] px-6 py-14 sm:px-14"
          initial={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true, margin: '-100px' }}
          whileInView={{ opacity: 1, y: 0 }}
        >
          {/* Terminal-ish substrate: faint scanline field + grain */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.5]"
            style={{
              backgroundImage:
                'repeating-linear-gradient(180deg, color-mix(in oklab, var(--foreground) 4%, transparent) 0px, color-mix(in oklab, var(--foreground) 4%, transparent) 1px, transparent 1px, transparent 6px)',
              maskImage:
                'radial-gradient(ellipse 70% 70% at 50% 50%, black, transparent 75%)',
              WebkitMaskImage:
                'radial-gradient(ellipse 70% 70% at 50% 50%, black, transparent 75%)',
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 left-1/2 h-56 w-[32rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--green),transparent)] opacity-[0.1] blur-3xl"
          />
          <Grain />

          <div className="relative flex flex-col items-center text-center">
            <SectionEyebrow index="05">{t('eyebrow')}</SectionEyebrow>
            <h2 className="mt-6 max-w-2xl text-balance font-display font-semibold text-3xl tracking-[-0.03em] sm:text-4xl">
              {t('title')}
            </h2>

            {/* Stats — hairline-separated instrument readout */}
            <dl className="mt-12 grid w-full grid-cols-1 divide-y divide-foreground/[0.08] border-foreground/[0.08] border-y md:grid-cols-4 md:divide-x md:divide-y-0">
              {statKeys.map((key, index) => (
                <motion.div
                  className="px-4 py-7"
                  initial={{ opacity: 0, y: 12 }}
                  key={key}
                  transition={{ delay: index * 0.08, duration: 0.4 }}
                  viewport={{ once: true }}
                  whileInView={{ opacity: 1, y: 0 }}
                >
                  <dt className="font-mono-ui text-[0.65rem] text-foreground/40 uppercase tracking-[0.18em]">
                    {t(`stats.${key}.label` as never)}
                  </dt>
                  <dd className="mt-3">
                    <CountUp
                      className="block font-display font-semibold text-4xl tabular-nums tracking-[-0.04em] sm:text-5xl"
                      value={t(`stats.${key}.value` as never)}
                    />
                  </dd>
                </motion.div>
              ))}
            </dl>

            <a
              className="mt-12 inline-flex h-11 items-center justify-center gap-2 rounded-full border border-foreground/12 bg-background/50 px-6 font-medium text-foreground/80 text-sm backdrop-blur-md transition-colors duration-300 hover:border-foreground/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              href="https://github.com/tutur3u/platform"
              rel="noopener noreferrer"
              target="_blank"
            >
              <GitBranch className="h-4 w-4" />
              {t('cta')}
            </a>

            <div className="mt-14 w-full border-foreground/[0.08] border-t pt-10">
              <p className="mb-5 font-mono-ui text-[0.62rem] text-foreground/35 uppercase tracking-[0.2em]">
                {t('backedBy')}
              </p>
              <a
                className="inline-block opacity-60 transition-opacity duration-300 hover:opacity-100"
                href="https://startup.google.com"
                rel="noopener noreferrer"
                target="_blank"
              >
                <Image
                  alt="Google for Startups"
                  className="h-8 w-auto sm:h-9 dark:brightness-0 dark:invert"
                  height={40}
                  src="/media/google-for-startups-transparent.png"
                  width={200}
                />
              </a>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
