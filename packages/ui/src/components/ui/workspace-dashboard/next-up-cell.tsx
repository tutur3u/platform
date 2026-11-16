'use client';

import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { DashboardCardError } from './dashboard-card-states';

/** One Next up cell: label, then the item or its own loading/error state. */
export function NextCell({
  icon,
  label,
  tone = 'default',
  status,
  onRetry,
  title,
  href,
  detail,
}: {
  icon: ReactNode;
  label: string;
  tone?: 'default' | 'danger';
  status: 'pending' | 'error' | 'success';
  onRetry: () => void;
  title: string | null;
  href?: string;
  detail: string;
}) {
  const t = useTranslations('dashboard.overview');
  return (
    <div className="grid min-w-0 content-start gap-1 border-t px-4 py-3 first:border-t-0 @min-[32rem]/card:border-t-0 @min-[32rem]/card:border-l @min-[32rem]/card:first:border-l-0">
      <span
        className={cn(
          'flex min-w-0 items-center gap-1.5 text-xs',
          tone === 'danger' ? 'text-dynamic-red' : 'text-muted-foreground'
        )}
      >
        {icon}
        <span className="truncate">{label}</span>
      </span>
      {status === 'pending' ? (
        <span
          aria-hidden
          className="h-4 w-3/4 rounded bg-muted motion-safe:animate-pulse"
        />
      ) : status === 'error' ? (
        <DashboardCardError
          message={t('next_error')}
          retryLabel={t('retry')}
          onRetry={onRetry}
        />
      ) : (
        <>
          {title ? (
            href ? (
              <a
                href={href}
                title={title}
                className="truncate font-semibold text-sm hover:underline focus-visible:outline-2 focus-visible:outline-ring"
              >
                {title}
              </a>
            ) : (
              <span title={title} className="truncate font-semibold text-sm">
                {title}
              </span>
            )
          ) : null}
          <span className="min-w-0 break-words text-muted-foreground text-xs">
            {detail}
          </span>
        </>
      )}
    </div>
  );
}
