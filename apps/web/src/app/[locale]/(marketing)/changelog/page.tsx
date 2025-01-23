'use client';

import { Badge } from '@repo/ui/components/ui/badge';
import { Card } from '@repo/ui/components/ui/card';
import { motion } from 'framer-motion';
import { ArrowRight, Bug, FileText, Rocket, Wrench } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

interface Update {
  title: string;
  description: string;
  type: 'feature' | 'improvement' | 'fix';
  date: string;
  version?: string;
}

interface MonthlyUpdate {
  month: string;
  updates: Update[];
}

const updates: MonthlyUpdate[] = [
  {
    month: 'January 2025',
    updates: [
      {
        title: 'Tuturuuu Tasks: Project Management Suite (Beta)',
        description:
          'Launched the beta version of Tuturuuu Tasks, a comprehensive project management solution. Features include customizable task boards with column management, detailed task tracking with start dates and deadlines, assignee management, and board-level progress summaries. Calendar integration functionality is under development for seamless task scheduling.',
        type: 'feature',
        date: 'January 23, 2025',
      },
      {
        title: 'Tuturuuu Spark: AI-Powered Goal Planning (Alpha)',
        description:
          'Introduced Tuturuuu Spark, an intelligent companion that transforms annual goals into actionable, time-blocked tasks. This AI-powered system helps users break down objectives into manageable steps and integrates them seamlessly with their calendar for enhanced goal achievement. Currently available in private alpha by invitation only, with plans for deeper ecosystem integration.',
        type: 'feature',
        date: 'January 22, 2025',
      },
      {
        title: 'Marketing Website Refresh',
        description:
          'Complete overhaul of our marketing website with new pages and improvements. Added Blog, Changelog, Terms of Service, and Privacy Policy pages. Updated Landing, Pricing, Branding, About Us, and Contact pages with fresh designs and improved content. Enhanced overall visual consistency across the platform.',
        type: 'feature',
        date: 'January 10, 2025',
      },
      {
        title: 'Dataset Crawler & Cloud Data Management',
        description:
          'Introduced powerful dataset management capabilities: HTML/Excel/CSV data crawler, cloud data exploration with interactive tables, comprehensive row and column CRUD operations, duplicate detection and removal, and API references for Python & JavaScript integration.',
        type: 'feature',
        date: 'January 9, 2025',
      },
    ],
  },
];

const getUpdateIcon = (type: Update['type']) => {
  switch (type) {
    case 'feature':
      return <Rocket className="h-5 w-5" />;
    case 'improvement':
      return <Wrench className="h-5 w-5" />;
    case 'fix':
      return <Bug className="h-5 w-5" />;
  }
};

const getUpdateColor = (type: Update['type']) => {
  switch (type) {
    case 'feature':
      return 'text-blue-500 dark:text-blue-400';
    case 'improvement':
      return 'text-green-500 dark:text-green-400';
    case 'fix':
      return 'text-orange-500 dark:text-orange-400';
  }
};

export default function ChangelogPage() {
  const t = useTranslations();

  return (
    <main className="container relative space-y-16 py-16 md:space-y-24 md:py-24">
      {/* Hero Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center"
      >
        <Badge
          variant="secondary"
          className="mb-6 px-4 py-2 text-base font-medium"
        >
          {t('common.product-updates')}
        </Badge>
        <h1 className="text-foreground mb-6 text-balance text-4xl font-bold md:text-5xl lg:text-6xl">
          {t('common.product-updates-title')}
        </h1>
        <p className="text-foreground/80 mx-auto max-w-2xl text-lg md:text-xl">
          {t('common.product-updates-description')}
        </p>
      </motion.section>

      {/* Update Types Legend */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-6 md:gap-12"
      >
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/10 dark:bg-blue-400/10">
            <Rocket className="h-4 w-4 text-blue-500 dark:text-blue-400" />
          </div>
          <span className="text-sm font-medium">
            {t('common.new-features')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500/10 dark:bg-green-400/10">
            <Wrench className="h-4 w-4 text-green-500 dark:text-green-400" />
          </div>
          <span className="text-sm font-medium">
            {t('common.improvements')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500/10 dark:bg-orange-400/10">
            <Bug className="h-4 w-4 text-orange-500 dark:text-orange-400" />
          </div>
          <span className="text-sm font-medium">{t('common.bug-fixes')}</span>
        </div>
      </motion.section>

      {/* Updates Timeline */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="mx-auto max-w-4xl"
      >
        {updates.map((monthlyUpdate, monthIndex) => (
          <div key={monthlyUpdate.month} className="mb-16 last:mb-0">
            <motion.h2
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 + monthIndex * 0.1 }}
              className="mb-8 text-2xl font-bold md:text-3xl"
            >
              {monthlyUpdate.month}
            </motion.h2>

            <div className="space-y-6">
              {monthlyUpdate.updates.map((update, updateIndex) => (
                <motion.div
                  key={update.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: 0.8 + monthIndex * 0.1 + updateIndex * 0.1,
                  }}
                >
                  <Card className="group relative overflow-hidden transition-all duration-300 hover:shadow-lg">
                    <div className="absolute inset-0 overflow-hidden">
                      <div className="animate-aurora absolute inset-0 opacity-[0.02] transition-opacity duration-300 group-hover:opacity-[0.04]" />
                    </div>

                    <div className="relative p-6 md:p-8">
                      <div className="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="flex flex-wrap items-center gap-3">
                          <div
                            className={`${getUpdateColor(
                              update.type
                            )} bg-current/10 flex h-10 w-10 items-center justify-center rounded-full transition-transform duration-300 group-hover:scale-110`}
                          >
                            {getUpdateIcon(update.type)}
                          </div>
                          <h3 className="text-xl font-bold md:text-2xl">
                            {update.title}
                          </h3>
                        </div>
                        <time className="text-foreground/60 text-sm font-medium">
                          {update.date}
                        </time>
                      </div>
                      <p className="text-foreground/80 text-base leading-relaxed md:text-lg">
                        {update.description}
                      </p>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        ))}
      </motion.section>

      {/* Subscribe Section */}
      {/* <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center"
      >
        <Card className="bg-foreground/5 mx-auto max-w-2xl overflow-hidden p-8 md:p-12">
          <div className="mb-8 flex justify-center">
            <div className="text-primary bg-primary/10 flex h-16 w-16 items-center justify-center rounded-full">
              <Star className="h-8 w-8" />
            </div>
          </div>
          <h2 className="mb-4 text-2xl font-bold md:text-3xl">
            {t('common.stay-updated')}
          </h2>
          <p className="text-foreground/60 mx-auto mb-8 max-w-xl text-lg">
            {t('common.changelog-subscribe-description')}
          </p>
          <div className="mx-auto flex max-w-md flex-col gap-4 sm:flex-row">
            <input
              type="email"
              placeholder={t('common.enter-email')}
              className="bg-foreground/10 placeholder:text-foreground/40 focus:bg-foreground/15 flex-1 rounded-lg px-4 py-3 text-base outline-none transition-colors"
            />
            <button className="bg-foreground hover:bg-foreground/90 text-background flex items-center justify-center gap-2 rounded-lg px-8 py-3 font-medium transition-all hover:gap-3">
              {t('common.subscribe')}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </Card>
      </motion.section> */}

      {/* Documentation Link */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center"
      >
        <Link
          href="https://docs.tuturuuu.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground/60 hover:text-foreground inline-flex items-center gap-2 text-sm font-medium transition-all hover:gap-3"
        >
          <FileText className="h-4 w-4" />
          <span>{t('common.view-full-documentation')}</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </motion.section>
    </main>
  );
}
