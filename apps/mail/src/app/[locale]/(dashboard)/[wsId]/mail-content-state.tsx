'use client';

import {
  Inbox,
  MailOpen,
  RefreshCw,
  Search,
  TriangleAlert,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';

export function MailContentState({
  kind,
  onAction,
}: {
  kind: 'loading' | 'error' | 'empty' | 'search' | 'reader' | 'no_mailbox';
  onAction?: () => void;
}) {
  const t = useTranslations('mail');
  if (kind === 'loading') {
    return (
      <div
        aria-label={t('loading')}
        className="w-full divide-y divide-border/50"
        role="status"
      >
        {[0, 1, 2, 3, 4].map((row) => (
          <div className="space-y-3 px-5 py-5" key={row}>
            <div className="flex justify-between gap-8">
              <Skeleton className="h-3 w-28 motion-reduce:animate-none" />
              <Skeleton className="h-3 w-10 motion-reduce:animate-none" />
            </div>
            <Skeleton className="h-3 w-4/5 motion-reduce:animate-none" />
            <Skeleton className="h-3 w-3/5 motion-reduce:animate-none" />
          </div>
        ))}
      </div>
    );
  }
  const Icon =
    kind === 'error'
      ? TriangleAlert
      : kind === 'search'
        ? Search
        : kind === 'reader'
          ? MailOpen
          : Inbox;
  const title =
    kind === 'error'
      ? t('load_failed')
      : kind === 'search'
        ? t('no_search_results')
        : kind === 'reader'
          ? t('select_message')
          : kind === 'no_mailbox'
            ? t('no_mailboxes')
            : t('empty');
  const description =
    kind === 'error'
      ? t('load_failed_description')
      : kind === 'search'
        ? t('no_search_results_description')
        : kind === 'reader'
          ? t('select_message_description')
          : kind === 'no_mailbox'
            ? t('no_mailbox_description')
            : t('empty_folder_description');
  return (
    <div
      className="flex min-h-80 flex-1 items-center justify-center px-6 py-12"
      role={kind === 'error' ? 'alert' : 'status'}
    >
      <div className="max-w-64 text-center">
        <div className="mx-auto mb-5 flex size-12 items-center justify-center rounded-xl bg-muted/70 text-muted-foreground">
          <Icon aria-hidden className="size-5" strokeWidth={1.5} />
        </div>
        <h2 className="text-balance font-medium text-sm tracking-tight">
          {title}
        </h2>
        <p className="mt-2 text-pretty text-muted-foreground text-sm leading-6">
          {description}
        </p>
        {onAction ? (
          <Button
            className="mt-5"
            onClick={onAction}
            size="sm"
            variant="outline"
          >
            {kind === 'error' ? <RefreshCw className="size-3.5" /> : null}
            {kind === 'error'
              ? t('retry')
              : kind === 'search'
                ? t('clear_search')
                : t('compose')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
