'use client';

import { Paperclip, Star } from '@tuturuuu/icons';
import type { MailThreadSummary } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { cn } from '@tuturuuu/utils/format';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

import type { MailFolder } from './mail-folders';
import { visibleMailLabels } from './mail-visible-labels';

function formatDate(value: string | null, locale: string) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function MailThreadRow({
  active,
  folder,
  onClick,
  onPrefetch,
  onSelect,
  selected,
  thread,
}: {
  active: boolean;
  folder?: MailFolder;
  onClick: () => void;
  onPrefetch: () => void;
  onSelect: (selected: boolean) => void;
  selected: boolean;
  thread: MailThreadSummary;
}) {
  const t = useTranslations('mail');
  const locale = useLocale();
  const prefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const labels = visibleMailLabels(thread.labels, folder);
  const participant = thread.participants[0];
  const participantLabel =
    participant?.displayName || participant?.address || t('unknown_sender');
  const cancelPrefetch = () => {
    if (prefetchTimer.current) clearTimeout(prefetchTimer.current);
    prefetchTimer.current = null;
  };
  const schedulePrefetch = () => {
    cancelPrefetch();
    prefetchTimer.current = setTimeout(onPrefetch, 180);
  };
  useEffect(
    () => () => {
      if (prefetchTimer.current) clearTimeout(prefetchTimer.current);
    },
    []
  );

  return (
    <div
      className={cn(
        'group relative min-w-0 max-w-full overflow-hidden rounded-xl transition-[background-color,transform] duration-200 hover:bg-accent/65 active:scale-[0.995]',
        active && 'bg-primary/[0.09]',
        selected && 'bg-accent/80',
        thread.unreadCount > 0 && !active && 'bg-foreground/[0.025]'
      )}
    >
      <Checkbox
        aria-label={t('select_thread')}
        checked={selected}
        className="absolute top-4 left-3 z-10 opacity-100 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[state=checked]:opacity-100 md:opacity-0"
        onCheckedChange={(value) => onSelect(value === true)}
      />
      <button
        aria-current={active ? 'true' : undefined}
        className="block w-full min-w-0 max-w-full py-4 pr-4 pl-10 text-left focus-visible:bg-accent focus-visible:underline focus-visible:outline-none"
        onClick={onClick}
        onFocus={onPrefetch}
        onPointerEnter={schedulePrefetch}
        onPointerLeave={cancelPrefetch}
        type="button"
      >
        <div className="mb-1 flex items-center gap-2">
          {thread.unreadCount > 0 ? (
            <span className="size-2 shrink-0 rounded-full bg-foreground" />
          ) : null}
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-sm',
              thread.unreadCount > 0 ? 'font-semibold' : 'font-medium'
            )}
          >
            {participantLabel}
            {thread.participants.length > 1
              ? ` +${thread.participants.length - 1}`
              : ''}
          </span>
          {thread.messageCount > 1 ? (
            <span
              title={t('message_count', { count: thread.messageCount })}
              className="inline-flex min-w-6 shrink-0 items-center justify-center rounded-md bg-muted px-1.5 py-0.5 font-semibold text-foreground text-xs tabular-nums"
            >
              <span aria-hidden="true">{thread.messageCount}</span>
              <span className="sr-only">
                {t('message_count', { count: thread.messageCount })}
              </span>
            </span>
          ) : null}
          <span className="max-w-[45%] shrink-0 text-right text-muted-foreground text-xs tabular-nums">
            {formatDate(thread.lastMessageAt, locale)}
          </span>
        </div>
        <div className="mb-1 flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-medium text-sm">
            {thread.subject || t('no_subject')}
          </span>
          {thread.hasAttachments ? <Paperclip className="size-3.5" /> : null}
          {thread.starred ? <Star className="size-3.5" /> : null}
        </div>
        <p className="line-clamp-2 break-words text-[0.8125rem] text-muted-foreground leading-5">
          {thread.latestSnippet}
        </p>
        {labels.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {labels.slice(0, 3).map((label) => (
              <Badge
                className="gap-1.5 text-[0.68rem]"
                key={label.id}
                variant="secondary"
              >
                <span
                  className="size-1.5 rounded-full bg-foreground/30"
                  style={
                    label.color ? { backgroundColor: label.color } : undefined
                  }
                />
                {label.name}
              </Badge>
            ))}
          </div>
        ) : null}
      </button>
    </div>
  );
}
