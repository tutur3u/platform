'use client';
import { Archive, CheckCheck, Trash2, X } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { MailIconButton } from './mail-icon-button';
import { MailLabelMenu } from './mail-label-menu';
export function MailBulkToolbar({
  threadIds,
  mailboxId,
  workspaceId,
  actionsPending,
  onAction,
  onChanged,
  onClear,
}: {
  threadIds: string[];
  mailboxId: string | null;
  workspaceId: string;
  actionsPending: boolean;
  onAction: (action: 'mark_read' | 'archive' | 'trash') => void;
  onChanged: () => Promise<void>;
  onClear: () => void;
}) {
  const t = useTranslations('mail');
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-xl bg-foreground/[0.04] p-1">
      <span className="px-2 text-xs tabular-nums">
        {t('selected_count', { count: threadIds.length })}
      </span>
      <MailIconButton
        aria-label={t('mark_read')}
        disabled={actionsPending}
        onClick={() => onAction('mark_read')}
        size="icon"
        variant="ghost"
      >
        <CheckCheck className="size-4" />
      </MailIconButton>
      <MailIconButton
        aria-label={t('archive')}
        disabled={actionsPending}
        onClick={() => onAction('archive')}
        size="icon"
        variant="ghost"
      >
        <Archive className="size-4" />
      </MailIconButton>
      {mailboxId ? (
        <MailLabelMenu
          mailboxId={mailboxId}
          onChanged={onChanged}
          threadIds={threadIds}
          workspaceId={workspaceId}
        />
      ) : null}
      <MailIconButton
        aria-label={t('trash')}
        disabled={actionsPending}
        onClick={() => onAction('trash')}
        size="icon"
        variant="ghost"
      >
        <Trash2 className="size-4" />
      </MailIconButton>
      <MailIconButton
        aria-label={t('clear_selection')}
        className="ml-auto"
        onClick={onClear}
        size="icon"
        variant="ghost"
      >
        <X className="size-4" />
      </MailIconButton>
    </div>
  );
}
