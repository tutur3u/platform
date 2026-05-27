'use client';

import {
  Archive,
  Inbox,
  type Mail,
  PenLine,
  Send,
  Star,
  Trash2,
  TriangleAlert,
} from '@tuturuuu/icons';
import type { MailMessageSummary } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

export type Folder =
  | 'archive'
  | 'drafts'
  | 'inbox'
  | 'sent'
  | 'spam'
  | 'starred'
  | 'trash';

export const folderIcons = {
  archive: Archive,
  drafts: PenLine,
  inbox: Inbox,
  sent: Send,
  spam: TriangleAlert,
  starred: Star,
  trash: Trash2,
} satisfies Record<Folder, typeof Inbox>;

function formatDate(value: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

export function isFolder(value: string): value is Folder {
  return [
    'archive',
    'drafts',
    'inbox',
    'sent',
    'spam',
    'starred',
    'trash',
  ].includes(value);
}

export function Section({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <div className="space-y-1">
      <div className="px-2 font-medium text-muted-foreground text-xs uppercase">
        {title}
      </div>
      {children}
    </div>
  );
}

export function RailButton({
  active,
  icon: Icon,
  label,
  meta,
  onClick,
}: {
  active: boolean;
  icon: typeof Mail;
  label: string;
  meta?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition hover:bg-foreground/5',
        active && 'bg-foreground/10'
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {meta ? (
          <span className="block truncate text-muted-foreground text-xs">
            {meta}
          </span>
        ) : null}
      </span>
    </button>
  );
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
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'block w-full px-4 py-3 text-left transition hover:bg-foreground/5',
        active && 'bg-foreground/10'
      )}
    >
      <div className="mb-1 flex items-center gap-2">
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
          {message.subject}
        </span>
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
