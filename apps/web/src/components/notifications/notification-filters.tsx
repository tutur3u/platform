'use client';

import type { NotificationTab, TranslationFn } from './notification-utils';
import {
  AtSign,
  Bell,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Loader2,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import { motion } from 'motion/react';
import { useState } from 'react';

interface NotificationFiltersProps {
  activeTab: NotificationTab;
  onTabChange: (tab: NotificationTab) => void;
  unreadCount: number;
  mentionCount: number;
  taskCount: number;
  onMarkAllAsRead: () => void;
  isMarkingAllRead: boolean;
  t: TranslationFn;
}

const TABS: Array<{
  id: NotificationTab;
  icon: typeof Bell;
  labelKey: string;
  countKey?: 'unread' | 'mentions' | 'tasks';
}> = [
  { id: 'all', icon: Inbox, labelKey: 'tab_all' },
  { id: 'unread', icon: Bell, labelKey: 'tab_unread', countKey: 'unread' },
  {
    id: 'mentions',
    icon: AtSign,
    labelKey: 'tab_mentions',
    countKey: 'mentions',
  },
  {
    id: 'tasks',
    icon: CheckCircle2,
    labelKey: 'tab_tasks',
    countKey: 'tasks',
  },
];

export function NotificationFilters({
  activeTab,
  onTabChange,
  unreadCount,
  mentionCount,
  taskCount,
  onMarkAllAsRead,
  isMarkingAllRead,
  t,
}: NotificationFiltersProps) {
  const getCount = (countKey?: 'unread' | 'mentions' | 'tasks') => {
    switch (countKey) {
      case 'unread':
        return unreadCount;
      case 'mentions':
        return mentionCount;
      case 'tasks':
        return taskCount;
      default:
        return 0;
    }
  };

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      {/* Tab navigation */}
      <div className="relative flex gap-1 rounded-xl bg-foreground/[0.03] p-1">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          const count = getCount(tab.countKey);
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                'relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'text-foreground'
                  : 'text-foreground/50 hover:text-foreground/70'
              )}
            >
              {/* Active background */}
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 rounded-lg bg-background shadow-sm ring-1 ring-foreground/5"
                  transition={{ type: 'spring', bounce: 0.15, duration: 0.5 }}
                />
              )}

              <Icon className="relative h-4 w-4" />
              <span className="relative hidden sm:inline">
                {t(tab.labelKey)}
              </span>

              {/* Count badge */}
              {count > 0 && (
                <span
                  className={cn(
                    'relative ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 font-medium text-xs',
                    isActive
                      ? 'bg-dynamic-blue/15 text-dynamic-blue'
                      : 'bg-foreground/10 text-foreground/50'
                  )}
                >
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Mark all as read */}
      {unreadCount > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={onMarkAllAsRead}
            disabled={isMarkingAllRead}
            className="h-9 gap-2 text-foreground/60 hover:text-foreground"
          >
            {isMarkingAllRead ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">{t('mark-all-read')}</span>
          </Button>
        </motion.div>
      )}
    </div>
  );
}

// ============================================================================
// Date Group Header
// ============================================================================

interface DateGroupHeaderProps {
  label: string;
  count: number;
}

export function DateGroupHeader({ label, count }: DateGroupHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="mb-3 flex items-center gap-3"
    >
      <h3 className="font-semibold text-foreground/70 text-xs uppercase tracking-wider">
        {label}
      </h3>
      <div className="h-px flex-1 bg-gradient-to-r from-foreground/10 to-transparent" />
      <span className="text-foreground/40 text-xs">{count}</span>
    </motion.div>
  );
}

// ============================================================================
// Pagination
// ============================================================================

interface NotificationPaginationProps {
  page: number;
  totalPages: number;
  hasMore: boolean;
  hasPrevious: boolean;
  onNextPage: () => void;
  onPreviousPage: () => void;
  onGoToPage: (page: number) => void;
  t: TranslationFn;
}

export function NotificationPagination({
  page,
  totalPages,
  hasMore,
  hasPrevious,
  onNextPage,
  onPreviousPage,
  onGoToPage,
  t,
}: NotificationPaginationProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');

  if (!hasMore && !hasPrevious) return null;

  const handleGoToPage = () => {
    const pageNum = parseInt(inputValue, 10);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
      onGoToPage(pageNum - 1); // Convert to 0-indexed
      setIsOpen(false);
      setInputValue('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleGoToPage();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mt-6 flex items-center justify-between rounded-xl border border-foreground/5 bg-foreground/[0.02] p-3"
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={onPreviousPage}
        disabled={!hasPrevious}
        className="h-8 gap-1.5 text-foreground/60 hover:text-foreground disabled:opacity-30"
      >
        ← {t('previous')}
      </Button>

      <div className="flex items-center gap-1.5">
        {/* Page indicator with popover for direct navigation */}
        {totalPages <= 7 ? (
          Array.from({ length: totalPages }, (_, i) => (
            <button
              key={i}
              onClick={() => onGoToPage(i)}
              className={cn(
                'h-2 w-2 rounded-full transition-all',
                i === page
                  ? 'w-4 bg-dynamic-blue'
                  : 'bg-foreground/20 hover:bg-foreground/30'
              )}
            />
          ))
        ) : (
          <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium text-sm transition-colors',
                  'bg-foreground/5 text-foreground/60 hover:bg-foreground/10 hover:text-foreground'
                )}
              >
                <span>{t('page')}</span>
                <span className="text-dynamic-blue">{page + 1}</span>
                <span className="text-foreground/40">/</span>
                <span>{totalPages}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-3" align="center" sideOffset={8}>
              <div className="space-y-3">
                <p className="text-center text-foreground/60 text-xs">
                  {t('go_to_page')}
                </p>
                <div className="flex items-center gap-2">
                  {/* Custom number input with increment/decrement */}
                  <div className="flex flex-1 items-center">
                    <button
                      type="button"
                      onClick={() => {
                        const current = parseInt(inputValue) || 2;
                        if (current > 1) {
                          setInputValue(String(current - 1));
                        }
                      }}
                      className="flex h-8 w-9 items-center justify-center rounded-l-md border border-r-0 border-foreground/10 text-foreground/40 transition-colors hover:bg-foreground/5 hover:text-foreground"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={inputValue}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        setInputValue(val);
                      }}
                      onKeyDown={handleKeyDown}
                      placeholder={`1-${totalPages}`}
                      className="h-8 rounded-none border-x-0 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const current = parseInt(inputValue) || 0;
                        if (current < totalPages) {
                          setInputValue(String(current + 1));
                        }
                      }}
                      className="flex h-8 w-9 items-center justify-center rounded-r-md border border-l-0 border-foreground/10 text-foreground/40 transition-colors hover:bg-foreground/5 hover:text-foreground"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleGoToPage}
                    disabled={
                      !inputValue ||
                      parseInt(inputValue) < 1 ||
                      parseInt(inputValue) > totalPages
                    }
                    className="h-8 px-3"
                  >
                    {t('go')}
                  </Button>
                </div>
                {/* Quick page buttons */}
                <div className="flex flex-wrap justify-center gap-1">
                  {[1, Math.ceil(totalPages / 2), totalPages]
                    .filter((v, i, a) => a.indexOf(v) === i) // unique values
                    .map((pageNum) => (
                      <button
                        key={pageNum}
                        onClick={() => {
                          onGoToPage(pageNum - 1);
                          setIsOpen(false);
                        }}
                        className={cn(
                          'rounded px-2 py-0.5 text-xs transition-colors',
                          page + 1 === pageNum
                            ? 'bg-dynamic-blue/15 text-dynamic-blue'
                            : 'bg-foreground/5 text-foreground/50 hover:bg-foreground/10 hover:text-foreground'
                        )}
                      >
                        {pageNum}
                      </button>
                    ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={onNextPage}
        disabled={!hasMore}
        className="h-8 gap-1.5 text-foreground/60 hover:text-foreground disabled:opacity-30"
      >
        {t('next')} →
      </Button>
    </motion.div>
  );
}
