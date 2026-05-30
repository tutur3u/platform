'use client';

import { Paperclip, Star } from '@tuturuuu/icons';
import type { MailMessageSummary } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';

function formatDate(value: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

export function MessageRow({
  active,
  message,
  onClick,
}: {
  active: boolean;
  message: MailMessageSummary;
  onClick: () => void;
}) {
  const t = useTranslations('mail');

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'group block w-full border-transparent border-l-2 px-4 py-3 text-left transition hover:bg-foreground/5',
        active && 'border-foreground bg-foreground/10 shadow-inner',
        message.unread && !active && 'bg-foreground/[0.025]'
      )}
    >
      <div className="mb-1 flex items-center gap-2">
        {message.unread ? (
          <span className="h-2 w-2 shrink-0 rounded-full bg-foreground" />
        ) : null}
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-sm',
            message.unread ? 'font-semibold' : 'font-medium'
          )}
        >
          {message.fromName || message.fromAddress}
        </span>
        <span className="shrink-0 text-muted-foreground text-xs">
          {formatDate(message.receivedAt ?? message.sentAt)}
        </span>
      </div>
      <div className="mb-1 flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-medium text-sm">
          {message.subject || t('no_subject')}
        </span>
        {message.hasAttachments ? (
          <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : null}
        {message.starred ? <Star className="h-3.5 w-3.5 shrink-0" /> : null}
      </div>
      <div className="line-clamp-2 text-muted-foreground text-xs">
        {message.snippet || message.bodyText}
      </div>
      {message.labels.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {message.labels.slice(0, 3).map((label) => (
            <Badge key={label.id} variant="secondary" className="text-xs">
              {label.name}
            </Badge>
          ))}
        </div>
      ) : null}
    </button>
  );
}
