'use client';

import { Badge } from '@repo/ui/components/ui/badge';
import { Card } from '@repo/ui/components/ui/card';
import { motion } from 'framer-motion';
import { ArrowRight, Bug, FileText, Rocket, Wrench, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useMemo, useState } from 'react';

interface Update {
  title: string;
  description: string;
  type: 'feature' | 'improvement' | 'fix';
  date: string;
  version?: string;
  tags?: string[];
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
        title: 'Tailwind CSS v4.0 Support',
        description:
          'Upgraded our monorepo to Tailwind CSS v4.0, bringing significant performance improvements and modern features. This update includes a new high-performance engine with up to 5x faster builds, native cascade layers, automatic content detection, built-in import support, dynamic utility values, modernized P3 color palette, container queries, 3D transform utilities, and expanded gradient APIs. The upgrade enhances our development workflow and enables more sophisticated UI implementations.',
        type: 'improvement',
        date: 'January 28, 2025',
        tags: ['UI/UX', 'Performance'],
      },
      {
        title: 'Security Center Launch',
        description:
          'Introduced our new Security Center, a comprehensive hub for understanding our security practices and commitments. Features detailed information about our data protection measures, encryption standards, compliance frameworks, and security best practices. Includes guidelines for responsible disclosure and our bug bounty program, demonstrating our commitment to maintaining the highest security standards.',
        type: 'feature',
        date: 'January 23, 2025',
        tags: ['Security', 'New', 'Company'],
      },
      {
        title: 'Enhanced Changelog Experience',
        description:
          'Revamped our changelog page with powerful new features for better update tracking. Added interactive tag filtering system, improved timeline navigation, and enhanced visual design. New features include clickable tags for filtering updates, smooth animations, better visual hierarchy, and a responsive timeline view. The new design provides a more intuitive and engaging way to explore product updates.',
        type: 'improvement',
        date: 'January 23, 2025',
        tags: ['UI/UX', 'New'],
      },
      {
        title: 'Tuturuuu Tasks: Project Management Suite',
        description:
          'Launched the beta version of Tuturuuu Tasks, a comprehensive project management solution. Features include customizable task boards with column management, detailed task tracking with start dates and deadlines, assignee management, and board-level progress summaries. Calendar integration functionality is under development for seamless task scheduling.',
        type: 'feature',
        date: 'January 23, 2025',
        tags: ['Beta', 'New'],
      },
      {
        title: 'Tuturuuu Spark: AI-Powered Goal Planning',
        description:
          'Introduced Tuturuuu Spark, an intelligent companion that transforms annual goals into actionable, time-blocked tasks. This AI-powered system helps users break down objectives into manageable steps and integrates them seamlessly with their calendar for enhanced goal achievement. Currently available in private alpha by invitation only, with plans for deeper ecosystem integration.',
        type: 'feature',
        date: 'January 22, 2025',
        tags: ['Alpha', 'Invite Only', 'AI'],
      },
      {
        title: 'Immersive Careers Page Launch',
        description:
          'Unveiled our new careers page featuring an engaging, interactive design with dynamic animations and visual effects. The page showcases our company values, benefits, cultural pillars, and team highlights through beautifully crafted sections with floating orbs, gradient animations, and responsive interactions. Built to attract top talent and communicate our vision for the future.',
        type: 'feature',
        date: 'January 13, 2025',
        tags: ['UI/UX', 'Company'],
      },
      {
        title: 'Marketing Website Refresh',
        description:
          'Complete overhaul of our marketing website with new pages and improvements. Added Blog, Changelog, Terms of Service, and Privacy Policy pages. Updated Landing, Pricing, Branding, About Us, and Contact pages with fresh designs and improved content. Enhanced overall visual consistency across the platform.',
        type: 'feature',
        date: 'January 10, 2025',
        tags: ['UI/UX'],
      },
      {
        title: 'Dataset Crawler & Cloud Data Management',
        description:
          'Introduced powerful dataset management capabilities: HTML/Excel/CSV data crawler, cloud data exploration with interactive tables, comprehensive row and column CRUD operations, duplicate detection and removal, and API references for Python & JavaScript integration.',
        type: 'feature',
        date: 'January 9, 2025',
        tags: ['Data', 'API'],
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

const getUpdateGradient = (type: Update['type']) => {
  switch (type) {
    case 'feature':
      return 'from-blue-500/20 via-transparent to-transparent dark:from-blue-400/20';
    case 'improvement':
      return 'from-green-500/20 via-transparent to-transparent dark:from-green-400/20';
    case 'fix':
      return 'from-orange-500/20 via-transparent to-transparent dark:from-orange-400/20';
  }
};

const getTagColor = (tag: string) => {
  const colors: Record<string, string> = {
    Alpha:
      'bg-purple-500/10 text-purple-500 dark:bg-purple-400/10 dark:text-purple-400',
    Beta: 'bg-blue-500/10 text-blue-500 dark:bg-blue-400/10 dark:text-blue-400',
    New: 'bg-green-500/10 text-green-500 dark:bg-green-400/10 dark:text-green-400',
    'Invite Only':
      'bg-yellow-500/10 text-yellow-500 dark:bg-yellow-400/10 dark:text-yellow-400',
    AI: 'bg-indigo-500/10 text-indigo-500 dark:bg-indigo-400/10 dark:text-indigo-400',
    'UI/UX':
      'bg-pink-500/10 text-pink-500 dark:bg-pink-400/10 dark:text-pink-400',
    Data: 'bg-cyan-500/10 text-cyan-500 dark:bg-cyan-400/10 dark:text-cyan-400',
    API: 'bg-teal-500/10 text-teal-500 dark:bg-teal-400/10 dark:text-teal-400',
  };

  return (
    colors[tag] ||
    'bg-gray-500/10 text-gray-500 dark:bg-gray-400/10 dark:text-gray-400'
  );
};

const getAllTags = (updates: MonthlyUpdate[]): string[] => {
  const tags = new Set<string>();
  updates.forEach((monthlyUpdate) => {
    monthlyUpdate.updates.forEach((update) => {
      update.tags?.forEach((tag) => tags.add(tag));
    });
  });
  return Array.from(tags).sort();
};

export default function ChangelogPage() {
  const t = useTranslations();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const allTags = useMemo(() => getAllTags(updates), []);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const clearFilters = () => {
    setSelectedTags([]);
  };

  const filteredUpdates = useMemo(() => {
    if (selectedTags.length === 0) return updates;

    return updates
      .map((monthlyUpdate) => ({
        ...monthlyUpdate,
        updates: monthlyUpdate.updates.filter((update) =>
          selectedTags.some((tag) => update.tags?.includes(tag))
        ),
      }))
      .filter((monthlyUpdate) => monthlyUpdate.updates.length > 0);
  }, [selectedTags]);

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8, ease: 'easeInOut' }}
      className="relative container py-16 md:py-24"
    >
      {/* Hero Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="text-center"
      >
        <Badge
          variant="secondary"
          className="mb-6 px-4 py-2 text-base font-medium"
        >
          {t('common.product-updates')}
        </Badge>
        <h1 className="mb-6 text-4xl font-bold text-balance text-foreground md:text-5xl lg:text-6xl">
          {t('common.product-updates-title')}
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-foreground/80 md:text-xl">
          {t('common.product-updates-description')}
        </p>
      </motion.section>

      {/* Tag Filters */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="mx-auto mt-16 max-w-4xl"
      >
        <div className="flex flex-wrap items-center justify-center gap-3">
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`${getTagColor(tag)} group relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 hover:scale-105 ${
                selectedTags.includes(tag)
                  ? 'ring-2 ring-offset-2 ring-offset-background'
                  : 'opacity-70 hover:opacity-100'
              }`}
            >
              {tag}
              {selectedTags.includes(tag) && (
                <X className="h-3 w-3 opacity-50 transition-opacity group-hover:opacity-100" />
              )}
            </button>
          ))}
          {selectedTags.length > 0 && (
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-foreground/60 transition-all hover:gap-2 hover:text-foreground"
            >
              Clear filters
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </motion.section>

      {/* Update Types Legend */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="mx-auto mt-12 flex max-w-3xl flex-wrap items-center justify-center gap-6 md:gap-12"
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

      {/* Timeline Section */}
      <div className="relative mt-24">
        {/* Sticky Timeline Navigation */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="pointer-events-none fixed top-1/2 left-8 hidden -translate-y-1/2 lg:block"
        >
          <div className="relative flex flex-col items-start gap-6">
            <div className="absolute top-0 left-[5px] h-full w-[2px] bg-gradient-to-b from-foreground/5 via-foreground/10 to-foreground/5" />

            {filteredUpdates.map((monthlyUpdate) => (
              <Link
                key={monthlyUpdate.month}
                href={`#${monthlyUpdate.month.toLowerCase().replace(/\s+/g, '-')}`}
                className="group pointer-events-auto relative flex items-center gap-4"
              >
                <div className="relative h-3 w-3">
                  <div className="absolute inset-0 rounded-full bg-foreground/20 transition-colors group-hover:bg-foreground/40" />
                  <div className="absolute inset-[3px] rounded-full bg-background transition-transform group-hover:scale-0" />
                </div>
                <span className="text-sm font-medium text-foreground/60 transition-colors group-hover:text-foreground">
                  {monthlyUpdate.month}
                </span>
              </Link>
            ))}
          </div>
        </motion.div>

        {/* Updates Content */}
        <div className="mx-auto max-w-4xl">
          {filteredUpdates.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center text-foreground/60"
            >
              <p className="text-lg">No updates match your selected filters.</p>
              <button
                onClick={clearFilters}
                className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-foreground/60 transition-all hover:gap-3 hover:text-foreground"
              >
                Clear filters
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          ) : (
            filteredUpdates.map((monthlyUpdate) => (
              <div
                key={monthlyUpdate.month}
                id={monthlyUpdate.month.toLowerCase().replace(/\s+/g, '-')}
                className="mb-24 scroll-mt-24 last:mb-0"
              >
                <motion.h2
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: '0px 0px -100px 0px' }}
                  transition={{
                    delay: 0.1,
                    duration: 0.6,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className="mb-8 text-2xl font-bold md:text-3xl"
                >
                  {monthlyUpdate.month}
                </motion.h2>

                <div className="relative space-y-8">
                  <div className="absolute top-0 left-8 hidden h-full w-[2px] bg-gradient-to-b from-foreground/5 via-foreground/10 to-foreground/5 lg:block" />

                  {monthlyUpdate.updates.map((update, updateIndex) => (
                    <motion.div
                      key={update.title}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, margin: '0px 0px -50px 0px' }}
                      transition={{
                        delay: 0.2 + updateIndex * 0.1,
                        duration: 0.6,
                        ease: [0.16, 1, 0.3, 1],
                      }}
                      className="group relative pl-0 lg:pl-24"
                    >
                      <div className="absolute top-8 left-[29px] hidden h-3 w-3 lg:block">
                        <div className="absolute inset-0 rounded-full bg-foreground/20 transition-colors group-hover:bg-foreground/40" />
                        <div className="absolute inset-[3px] rounded-full bg-background transition-transform group-hover:scale-0" />
                      </div>

                      <Card className="group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
                        <div className="absolute inset-0 overflow-hidden">
                          <div className="absolute inset-0 bg-gradient-to-r opacity-100 transition-opacity duration-500 group-hover:opacity-100" />
                          <div
                            className={`bg-gradient-to-r ${getUpdateGradient(update.type)} absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100`}
                          />
                        </div>

                        <div className="relative p-6 md:p-8">
                          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div className="space-y-4">
                              <div className="flex flex-wrap items-center gap-3">
                                <div
                                  className={`${getUpdateColor(
                                    update.type
                                  )} flex h-12 w-12 items-center justify-center rounded-xl bg-current/10 backdrop-blur-sm transition-transform duration-300 group-hover:scale-110 group-hover:rounded-2xl`}
                                >
                                  {getUpdateIcon(update.type)}
                                </div>
                                <div className="space-y-1.5">
                                  <h3 className="text-xl font-bold md:text-2xl">
                                    {update.title}
                                  </h3>
                                  <div className="flex flex-wrap items-center gap-2">
                                    {update.tags?.map((tag) => (
                                      <button
                                        key={tag}
                                        onClick={() => toggleTag(tag)}
                                        className={`${getTagColor(tag)} inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-transform duration-300 hover:scale-105 ${
                                          selectedTags.includes(tag)
                                            ? 'ring-2 ring-offset-2 ring-offset-background'
                                            : 'opacity-70 hover:opacity-100'
                                        }`}
                                      >
                                        {tag}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                            <time className="text-sm font-medium text-foreground/60">
                              {update.date}
                            </time>
                          </div>
                          <div className="space-y-4">
                            <p className="text-base leading-relaxed text-foreground/80 md:text-lg">
                              {update.description}
                            </p>
                            {update.version && (
                              <div className="flex items-center gap-2">
                                <Badge
                                  variant="outline"
                                  className="text-xs font-medium"
                                >
                                  v{update.version}
                                </Badge>
                              </div>
                            )}
                          </div>
                        </div>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Documentation Link */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '0px 0px -100px 0px' }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="mt-24 text-center"
      >
        <Link
          href="https://docs.tuturuuu.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm font-medium text-foreground/60 transition-all hover:gap-3 hover:text-foreground"
        >
          <FileText className="h-4 w-4" />
          <span>{t('common.view-full-documentation')}</span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      </motion.section>
    </motion.main>
  );
}
