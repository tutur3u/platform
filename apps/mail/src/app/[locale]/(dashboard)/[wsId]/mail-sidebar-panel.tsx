'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2, Mail, PenLine, Users } from '@tuturuuu/icons';
import { getMailBootstrap, type MailMailbox } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

interface MailSidebarPanelProps {
  closeOnMobile?: () => void;
  isCollapsed: boolean;
  onCompose: () => void;
  workspaceId: string;
}

export function MailSidebarPanel({
  closeOnMobile,
  isCollapsed,
  onCompose,
  workspaceId,
}: MailSidebarPanelProps) {
  const t = useTranslations('mail');
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const bootstrapQuery = useQuery({
    queryFn: () => getMailBootstrap(workspaceId),
    queryKey: ['mail', workspaceId, 'bootstrap'],
  });
  const mailboxes = bootstrapQuery.data?.mailboxes ?? [];
  const selectedMailboxId = searchParams.get('mailbox');
  const activeMailboxId =
    mailboxes.find((mailbox) => mailbox.id === selectedMailboxId)?.id ??
    mailboxes[0]?.id ??
    null;

  function selectMailbox(mailboxId: string) {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('mailbox', mailboxId);
    nextParams.delete('message');
    const nextQuery = nextParams.toString();

    window.history.replaceState(
      null,
      '',
      nextQuery ? `${pathname}?${nextQuery}` : pathname
    );
    closeOnMobile?.();
  }

  function compose() {
    onCompose();
    closeOnMobile?.();
  }

  if (isCollapsed) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center gap-1 border-foreground/10 border-t px-2 py-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label={t('compose')}
              className="aspect-square size-10 max-h-10 min-h-10 min-w-10 max-w-10 shrink-0 rounded-md p-0"
              onClick={compose}
              type="button"
            >
              <PenLine className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">{t('compose')}</TooltipContent>
        </Tooltip>
        <div className="my-1 h-px w-8 bg-border" />
        {bootstrapQuery.isLoading ? (
          <Loader2 className="mt-2 h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <div className="scrollbar-none flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto">
            {mailboxes.map((mailbox) => (
              <CollapsedMailboxButton
                active={mailbox.id === activeMailboxId}
                key={mailbox.id}
                mailbox={mailbox}
                onClick={() => selectMailbox(mailbox.id)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col border-foreground/10 border-t">
      <div className="p-3">
        <Button
          className="h-11 w-full justify-start rounded-xl"
          onClick={compose}
        >
          <PenLine className="h-4 w-4" />
          {t('compose')}
        </Button>
      </div>
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.14em]">
          {t('mailboxes')}
        </div>
        <span className="rounded-full bg-foreground/5 px-2 py-0.5 font-medium text-[0.7rem] text-muted-foreground tabular-nums">
          {mailboxes.length}
        </span>
      </div>
      <div className="scrollbar-none min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
        {bootstrapQuery.isLoading ? (
          <div className="flex items-center gap-2 px-2 py-3 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('loading')}
          </div>
        ) : mailboxes.length > 0 ? (
          mailboxes.map((mailbox) => (
            <MailboxButton
              active={mailbox.id === activeMailboxId}
              key={mailbox.id}
              mailbox={mailbox}
              onClick={() => selectMailbox(mailbox.id)}
            />
          ))
        ) : (
          <div className="px-2 py-3 text-muted-foreground text-sm">
            {t('no_mailboxes')}
          </div>
        )}
      </div>
    </div>
  );
}

function MailboxButton({
  active,
  mailbox,
  onClick,
}: {
  active: boolean;
  mailbox: MailMailbox;
  onClick: () => void;
}) {
  const Icon = mailbox.type === 'shared' ? Users : Mail;

  return (
    <button
      type="button"
      aria-current={active ? 'true' : undefined}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-xl border border-transparent px-2.5 py-2.5 text-left text-sm transition hover:bg-accent hover:text-accent-foreground',
        active &&
          'border-foreground/10 bg-accent text-accent-foreground shadow-sm'
      )}
      onClick={onClick}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          {mailbox.displayName}
        </span>
        <span className="block truncate text-muted-foreground text-xs">
          {mailbox.address}
        </span>
      </span>
    </button>
  );
}

function CollapsedMailboxButton({
  active,
  mailbox,
  onClick,
}: {
  active: boolean;
  mailbox: MailMailbox;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={mailbox.displayName}
          className={cn(
            'aspect-square size-10 max-h-10 min-h-10 min-w-10 max-w-10 shrink-0 rounded-md p-0 font-semibold text-xs',
            active
              ? 'bg-foreground text-background hover:bg-foreground/90'
              : 'bg-background hover:bg-accent'
          )}
          onClick={onClick}
          type="button"
          variant="ghost"
        >
          {getMailboxInitial(mailbox.displayName || mailbox.address)}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">
        <div className="space-y-0.5">
          <div>{mailbox.displayName}</div>
          <div className="text-muted-foreground text-xs">{mailbox.address}</div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function getMailboxInitial(value: string): ReactNode {
  return value.trim().charAt(0).toUpperCase() || <Mail className="h-4 w-4" />;
}
