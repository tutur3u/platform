'use client';

import { AtSign, Bell, CheckCircle2, Inbox } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { motion } from 'motion/react';
import type { NotificationTab, TranslationFn } from './notification-utils';

interface NotificationEmptyProps {
  tab: NotificationTab;
  hasFilters: boolean;
  t: TranslationFn;
}

const TAB_CONFIG: Record<
  NotificationTab,
  {
    icon: typeof Bell;
    titleKey: string;
    descriptionKey: string;
    filteredDescriptionKey: string;
  }
> = {
  all: {
    icon: Inbox,
    titleKey: 'empty_all_title',
    descriptionKey: 'empty_all_description',
    filteredDescriptionKey: 'empty_filtered_description',
  },
  unread: {
    icon: CheckCircle2,
    titleKey: 'empty_unread_title',
    descriptionKey: 'empty_unread_description',
    filteredDescriptionKey: 'empty_filtered_description',
  },
  mentions: {
    icon: AtSign,
    titleKey: 'empty_mentions_title',
    descriptionKey: 'empty_mentions_description',
    filteredDescriptionKey: 'empty_filtered_description',
  },
  tasks: {
    icon: Bell,
    titleKey: 'empty_tasks_title',
    descriptionKey: 'empty_tasks_description',
    filteredDescriptionKey: 'empty_filtered_description',
  },
};

export function NotificationEmpty({
  tab,
  hasFilters,
  t,
}: NotificationEmptyProps) {
  const config = TAB_CONFIG[tab];
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
      className="flex flex-col items-center justify-center py-16"
    >
      {/* Animated icon container */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
        className={cn(
          'relative mb-6 flex h-20 w-20 items-center justify-center',
          'rounded-2xl bg-linear-to-br from-foreground/5 to-foreground/10',
          'ring-1 ring-foreground/5'
        )}
      >
        {/* Subtle glow effect */}
        <div className="absolute inset-0 rounded-2xl bg-linear-to-br from-dynamic-blue/5 to-transparent" />

        <Icon className="relative h-8 w-8 text-foreground/40" />

        {/* Decorative dots */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="-right-1 -top-1 absolute h-2 w-2 rounded-full bg-dynamic-blue/30"
        />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="-bottom-1 -left-1 absolute h-1.5 w-1.5 rounded-full bg-foreground/20"
        />
      </motion.div>

      {/* Title */}
      <motion.h3
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.4 }}
        className="mb-2 font-semibold text-foreground/80 text-lg"
      >
        {t(config.titleKey)}
      </motion.h3>

      {/* Description */}
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4 }}
        className="max-w-sm text-center text-foreground/50 text-sm leading-relaxed"
      >
        {hasFilters
          ? t(config.filteredDescriptionKey)
          : t(config.descriptionKey)}
      </motion.p>
    </motion.div>
  );
}

export function NotificationSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          className="flex items-start gap-4 rounded-xl border border-foreground/5 bg-foreground/2 p-4"
          style={{ animationDelay: `${i * 100}ms` }}
        >
          {/* Icon skeleton */}
          <div className="h-10 w-10 flex-none animate-pulse rounded-xl bg-foreground/5" />

          {/* Content skeleton */}
          <div className="min-w-0 flex-1 space-y-2.5">
            <div className="flex items-center gap-2">
              <div className="h-3 w-16 animate-pulse rounded bg-foreground/5" />
              <div className="h-3 w-20 animate-pulse rounded bg-foreground/5" />
            </div>
            <div className="h-4 w-3/4 animate-pulse rounded bg-foreground/5" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-foreground/5" />
          </div>

          {/* Action skeleton */}
          <div className="h-8 w-8 flex-none animate-pulse rounded-lg bg-foreground/5" />
        </div>
      ))}
    </div>
  );
}
