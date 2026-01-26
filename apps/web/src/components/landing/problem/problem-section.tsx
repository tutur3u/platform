'use client';

import { AppWindow, Brain, Clock } from '@tuturuuu/icons';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { StatCard } from './stat-card';

export function ProblemSection() {
  const t = useTranslations('landing.problem');

  const stats: Array<{
    icon: typeof AppWindow;
    value: string;
    label: string;
    color: 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple';
  }> = [
    {
      icon: AppWindow,
      value: t('stats.apps.value'),
      label: t('stats.apps.label'),
      color: 'red',
    },
    {
      icon: Clock,
      value: t('stats.hours.value'),
      label: t('stats.hours.label'),
      color: 'orange',
    },
    {
      icon: Brain,
      value: t('stats.context.value'),
      label: t('stats.context.label'),
      color: 'yellow',
    },
  ];

  return (
    <section className="relative px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6 }}
          className="mb-12 text-center"
        >
          <h2 className="mb-4 font-bold text-3xl tracking-tight sm:text-4xl">
            {t('title')}
          </h2>
          <p className="mx-auto max-w-xl text-foreground/60 text-lg">
            {t('subtitle')}
          </p>
        </motion.div>

        <div className="grid gap-4 sm:grid-cols-3 sm:gap-6">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-50px' }}
              transition={{ delay: index * 0.1, duration: 0.5 }}
            >
              <StatCard {...stat} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
