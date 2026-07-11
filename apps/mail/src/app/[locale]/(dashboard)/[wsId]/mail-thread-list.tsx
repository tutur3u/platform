'use client';

import { Paperclip, Star } from '@tuturuuu/icons';
import type { MailThreadSummary } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';

function formatDate(value: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
  }).format(new Date(value));
}

export function MailThreadRow({
  active,
  onClick,
  onSelect,
  selected,
  thread,
}: {
  active: boolean;
  onClick: () => void;
  onSelect: (selected: boolean) => void;
  selected: boolean;
  thread: MailThreadSummary;
}) {
  const t = useTranslations('mail');
  const participant = thread.participants[0];
  const participantLabel =
    participant?.displayName || participant?.address || t('unknown_sender');

  return (
    <div
      className={cn(
        'group relative border-transparent border-l-2 transition hover:bg-foreground/5',
        active && 'border-foreground bg-foreground/[0.075]',
        thread.unreadCount > 0 && !active && 'bg-foreground/[0.025]'
      )}
    >
      <Checkbox
        aria-label={t('select_thread')}
        checked={selected}
        className="absolute top-4 left-3 z-10 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[state=checked]:opacity-100"
        onCheckedChange={(value) => onSelect(value === true)}
      />
      <button
        aria-current={active ? 'true' : undefined}
        className="block w-full py-3 pr-4 pl-10 text-left"
        onClick={onClick}
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
            <span className="text-muted-foreground text-xs tabular-nums">
              {thread.messageCount}
            </span>
          ) : null}
          <span className="shrink-0 text-muted-foreground text-xs">
            {formatDate(thread.lastMessageAt)}
          </span>
        </div>
        <div className="mb-1 flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-medium text-sm">
            {thread.subject || t('no_subject')}
          </span>
          {thread.hasAttachments ? <Paperclip className="size-3.5" /> : null}
          {thread.starred ? <Star className="size-3.5" /> : null}
        </div>
        <p className="line-clamp-2 text-muted-foreground text-xs leading-5">
          {thread.latestSnippet}
        </p>
        {thread.labels.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {thread.labels.slice(0, 3).map((label) => (
              <Badge
                className="text-[0.68rem]"
                key={label.id}
                variant="secondary"
              >
                {label.name}
              </Badge>
            ))}
          </div>
        ) : null}
      </button>
    </div>
  );
}
