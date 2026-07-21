'use client';

import {
  ArrowRight,
  Globe,
  Lock,
  MessageSquare,
  Shield,
} from '@tuturuuu/icons/lucide';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Grain, GridSubstrate } from '../shared/atmosphere';

export function CTASection() {
  const t = useTranslations('landing.cta');

  const trustItems = [
    { icon: Shield, label: t('trust.openSource'), tone: 'text-dynamic-green' },
    { icon: Lock, label: t('trust.security'), tone: 'text-dynamic-blue' },
    { icon: Globe, label: t('trust.selfHost'), tone: 'text-dynamic-purple' },
  ];

  return (
    <section className="relative px-4 py-24 pb-32 sm:px-6 sm:py-28 sm:pb-40 lg:px-8 lg:py-32 lg:pb-48">
      <div className="mx-auto max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true, margin: '-100px' }}
          whileInView={{ opacity: 1, y: 0 }}
        >
          <div className="relative overflow-hidden rounded-[2rem] border border-foreground/10 bg-foreground/[0.02] px-6 py-16 text-center sm:px-16 sm:py-20">
            {/* Full brand light rig, mirrored: the page closes the way it opened */}
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-32 left-1/2 h-80 w-[44rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--purple)_60%,transparent),transparent)] opacity-40 blur-3xl dark:opacity-50"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-24 left-[15%] h-56 w-[26rem] rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--cyan)_55%,transparent),transparent)] opacity-30 blur-3xl dark:opacity-40"
            />
            <GridSubstrate size="48px" />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-20 top-0 h-px bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--purple)_60%,transparent),color-mix(in_oklab,var(--cyan)_60%,transparent),transparent)]"
            />
            <Grain />

            <div className="relative">
              <h2 className="mx-auto max-w-2xl text-balance font-display font-semibold text-4xl leading-[1.02] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
                {t('title')}
              </h2>
              <p className="mx-auto mt-6 max-w-lg text-balance text-foreground/55 text-lg">
                {t('description')}
              </p>

              <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  className="group relative inline-flex h-12 w-full items-center justify-center overflow-hidden rounded-full bg-[linear-gradient(100deg,var(--purple),var(--blue))] px-8 font-medium text-white shadow-[0_8px_30px_-8px_color-mix(in_oklab,var(--purple)_70%,transparent)] transition-shadow duration-300 hover:shadow-[0_12px_40px_-8px_color-mix(in_oklab,var(--purple)_85%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto"
                  href="/onboarding"
                >
                  <span
                    aria-hidden
                    className="absolute inset-0 -translate-x-full bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.25),transparent)] transition-transform duration-700 group-hover:translate-x-full"
                  />
                  <span className="relative flex items-center">
                    {t('primary')}
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </span>
                </Link>
                <Link
                  className="inline-flex h-12 w-full items-center justify-center rounded-full border border-foreground/12 bg-background/40 px-6 font-medium text-foreground/75 backdrop-blur-md transition-colors duration-300 hover:border-foreground/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto"
                  href="/contact"
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  {t('secondary')}
                </Link>
              </div>

              {/* Trust readout */}
              <div className="mx-auto mt-14 grid max-w-2xl grid-cols-1 divide-y divide-foreground/[0.08] border-foreground/[0.08] border-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                {trustItems.map((item) => (
                  <div
                    className="flex items-center justify-center gap-2 px-3 py-4"
                    key={item.label}
                  >
                    <item.icon className={`h-3.5 w-3.5 ${item.tone}`} />
                    <span className="font-mono-ui text-[0.65rem] text-foreground/45 uppercase tracking-[0.14em]">
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>

              <p className="mt-8 font-mono-ui text-[0.65rem] text-foreground/30 uppercase tracking-[0.16em]">
                {t('note')}
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
