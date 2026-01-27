'use client';

import { Clock, Code2, GitBranch, Users } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export function GithubStats() {
  const t = useTranslations('landing.socialProof');

  const stats = [
    {
      icon: Clock,
      value: t('stats.years.value'),
      label: t('stats.years.label'),
      color: 'purple',
    },
    {
      icon: Code2,
      value: t('stats.commits.value'),
      label: t('stats.commits.label'),
      color: 'green',
    },
    {
      icon: Users,
      value: t('stats.contributors.value'),
      label: t('stats.contributors.label'),
      color: 'blue',
    },
  ];

  return (
    <section className="relative px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          <h2 className="mb-8 font-bold text-2xl tracking-tight sm:text-3xl">
            {t('title')}
          </h2>

          {/* Stats */}
          <div className="mb-8 flex flex-wrap items-center justify-center gap-6 sm:gap-10">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1, duration: 0.4 }}
                className="flex items-center gap-2"
              >
                <stat.icon
                  className={cn('h-5 w-5', `text-dynamic-${stat.color}`)}
                />
                <span className="font-bold text-lg">{stat.value}</span>
                <span className="text-foreground/60 text-sm">{stat.label}</span>
              </motion.div>
            ))}
          </div>

          {/* CTA */}
          <Button variant="outline" className="gap-2" asChild>
            <Link
              href="https://github.com/tutur3u/platform"
              target="_blank"
              rel="noopener noreferrer"
            >
              <GitBranch className="h-4 w-4" />
              {t('cta')}
            </Link>
          </Button>

          {/* Backed by Google for Startups */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="mt-12 border-foreground/10 border-t pt-10"
          >
            <p className="mb-4 text-foreground/50 text-sm">{t('backedBy')}</p>
            <Link
              href="https://startup.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block opacity-70 transition-opacity hover:opacity-100"
            >
              <Image
                src="/media/google-for-startups-transparent.png"
                alt="Google for Startups"
                width={200}
                height={40}
                className="h-8 w-auto sm:h-10 dark:brightness-0 dark:invert"
              />
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
