'use client';
import { Archive, Mail, MailOpen, Star, Trash2 } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { MailIconButton } from './mail-icon-button';

export function MailThreadHeader({
  subject,
  messageCount,
  starred,
  unread,
  onRead,
  actionPending,
  isDraft,
  labelActions,
  onStar,
  onArchive,
  onTrash,
}: {
  subject: string;
  messageCount: number;
  starred: boolean;
  unread: boolean;
  onRead?: () => void;
  actionPending: boolean;
  isDraft: boolean;
  labelActions?: ReactNode;
  onStar: () => void;
  onArchive: () => void;
  onTrash: () => void;
}) {
  const t = useTranslations('mail');
  return (
    <header className="bg-background/90 px-4 py-3 backdrop-blur md:px-5">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1 basis-40">
          <h1 className="text-pretty break-words font-semibold text-lg leading-tight md:text-xl">
            {subject || t('no_subject')}
          </h1>
          <p className="mt-2 inline-flex items-center rounded-md bg-muted px-2 py-0.5 font-medium text-foreground text-sm tabular-nums">
            {t('message_count', { count: messageCount })}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {labelActions}
          {!isDraft && onRead ? (
            <MailIconButton
              aria-label={t(unread ? 'mark_read' : 'mark_unread')}
              disabled={actionPending}
              onClick={onRead}
            >
              {unread ? (
                <MailOpen className="size-4" />
              ) : (
                <Mail className="size-4" />
              )}
            </MailIconButton>
          ) : null}
          <MailIconButton
            aria-label={starred ? t('unstar') : t('star')}
            aria-pressed={Boolean(starred)}
            disabled={actionPending}
            onClick={onStar}
            size="icon"
            variant="ghost"
          >
            <Star className={starred ? 'size-4 fill-current' : 'size-4'} />
          </MailIconButton>
          <MailIconButton
            aria-label={t('archive')}
            disabled={actionPending}
            onClick={onArchive}
            size="icon"
            variant="ghost"
          >
            <Archive className="size-4" />
          </MailIconButton>
          <MailIconButton
            aria-label={isDraft ? t('delete_draft') : t('trash')}
            disabled={actionPending}
            onClick={onTrash}
            size="icon"
            variant="ghost"
          >
            <Trash2 className="size-4" />
          </MailIconButton>
        </div>
      </div>
    </header>
  );
}
