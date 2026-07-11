'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2, Mail, PenLine, Settings, Tag, Users } from '@tuturuuu/icons';
import {
  getMailBootstrap,
  getMailboxOrganization,
  type MailMailbox,
} from '@tuturuuu/internal-api';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Button } from '@tuturuuu/ui/button';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { MailSettingsDialog } from './mail-settings-dialog';

export function MailSidebarPanel({
  closeOnMobile,
  folderLinks,
  isCollapsed,
  onCompose,
  workspaceId,
}: {
  closeOnMobile?: () => void;
  folderLinks: (NavLink | null)[];
  isCollapsed: boolean;
  onCompose: () => void;
  workspaceId: string;
}) {
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
  const organizationQuery = useQuery({
    enabled: Boolean(activeMailboxId),
    queryFn: () => getMailboxOrganization(workspaceId, activeMailboxId ?? ''),
    queryKey: ['mail', workspaceId, activeMailboxId, 'organization'],
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const activeMailbox =
    mailboxes.find((mailbox) => mailbox.id === activeMailboxId) ?? null;

  const selectMailbox = (mailboxId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('mailbox', mailboxId);
    params.delete('thread');
    window.history.replaceState(null, '', `${pathname}?${params}`);
    closeOnMobile?.();
  };
  const compose = () => {
    onCompose();
    closeOnMobile?.();
  };

  if (isCollapsed) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center gap-1 border-foreground/10 border-t px-2 py-3">
        <IconTooltip label={t('compose')}>
          <Button className="size-10" onClick={compose} size="icon">
            <PenLine className="size-4" />
          </Button>
        </IconTooltip>
        <div className="my-1 h-px w-8 bg-border" />
        {folderLinks.filter(Boolean).map((link) => {
          if (!link) return null;
          return (
            <IconTooltip key={link.id} label={String(link.title)}>
              <Button
                asChild
                className="size-10"
                size="icon"
                variant={
                  pathname === link.href?.split('?')[0] ? 'secondary' : 'ghost'
                }
              >
                <Link href={link.href ?? '#'}>{link.icon}</Link>
              </Button>
            </IconTooltip>
          );
        })}
        <div className="my-1 h-px w-8 bg-border" />
        <div className="scrollbar-none flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
          {mailboxes.map((mailbox) => (
            <CollapsedMailboxButton
              active={mailbox.id === activeMailboxId}
              key={mailbox.id}
              mailbox={mailbox}
              onClick={() => selectMailbox(mailbox.id)}
            />
          ))}
        </div>
        <IconTooltip label={t('settings')}>
          <Button
            className="size-10"
            onClick={() => setSettingsOpen(true)}
            size="icon"
            variant="ghost"
          >
            <Settings className="size-4" />
          </Button>
        </IconTooltip>
        <MailSettingsDialog
          mailbox={activeMailbox}
          onOpenChange={setSettingsOpen}
          open={settingsOpen}
          workspaceId={workspaceId}
        />
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
          <PenLine className="size-4" /> {t('compose')}
        </Button>
      </div>
      <Accordion
        className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-2"
        defaultValue={['folders', 'labels', 'mailboxes']}
        type="multiple"
      >
        <AccordionItem className="border-0" value="folders">
          <AccordionTrigger className="px-2 py-2 text-muted-foreground text-xs uppercase tracking-[0.14em]">
            {t('folders')}
          </AccordionTrigger>
          <AccordionContent className="space-y-0.5 pb-2">
            {folderLinks.filter(Boolean).map((link) =>
              link ? (
                <Link
                  className={cn(
                    'flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm transition hover:bg-accent',
                    pathname === link.href?.split('?')[0] &&
                      'bg-accent font-medium'
                  )}
                  href={link.href ?? '#'}
                  key={link.id}
                  onClick={closeOnMobile}
                >
                  {link.icon}
                  <span className="min-w-0 flex-1">{link.title}</span>
                  {link.id === 'mail.folder.inbox' &&
                  activeMailbox?.unreadCount ? (
                    <span className="rounded-full bg-foreground px-2 py-0.5 text-background text-xs tabular-nums">
                      {activeMailbox.unreadCount}
                    </span>
                  ) : null}
                </Link>
              ) : null
            )}
            {(organizationQuery.data?.folders ?? [])
              .filter((folder) => folder.kind === 'custom')
              .map((folder) => (
                <Link
                  className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm hover:bg-accent"
                  href={`${pathname}?mailbox=${activeMailboxId}&folderId=${folder.id}`}
                  key={folder.id}
                >
                  <Mail className="size-4" />{' '}
                  <span className="truncate">{folder.name}</span>
                </Link>
              ))}
          </AccordionContent>
        </AccordionItem>
        <AccordionItem className="border-0" value="labels">
          <AccordionTrigger className="px-2 py-2 text-muted-foreground text-xs uppercase tracking-[0.14em]">
            {t('labels')}
          </AccordionTrigger>
          <AccordionContent className="space-y-0.5 pb-2">
            {(organizationQuery.data?.labels ?? [])
              .filter((label) => label.kind === 'custom')
              .map((label) => (
                <Link
                  className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm hover:bg-accent"
                  href={`${pathname}?mailbox=${activeMailboxId}&label=${encodeURIComponent(label.slug)}`}
                  key={label.id}
                >
                  <Tag className="size-4" />{' '}
                  <span className="truncate">{label.name}</span>
                </Link>
              ))}
            {!organizationQuery.isLoading &&
            !(organizationQuery.data?.labels ?? []).some(
              (label) => label.kind === 'custom'
            ) ? (
              <p className="px-2.5 py-2 text-muted-foreground text-xs">
                {t('no_custom_labels')}
              </p>
            ) : null}
          </AccordionContent>
        </AccordionItem>
        <AccordionItem className="border-0" value="mailboxes">
          <AccordionTrigger className="px-2 py-2 text-muted-foreground text-xs uppercase tracking-[0.14em]">
            {t('mailboxes')}
          </AccordionTrigger>
          <AccordionContent className="space-y-1 pb-3">
            {bootstrapQuery.isLoading ? (
              <div className="flex items-center gap-2 px-2 py-3 text-muted-foreground text-sm">
                <Loader2 className="size-4 animate-spin" />
                {t('loading')}
              </div>
            ) : (
              mailboxes.map((mailbox) => (
                <MailboxButton
                  active={mailbox.id === activeMailboxId}
                  key={mailbox.id}
                  mailbox={mailbox}
                  onClick={() => selectMailbox(mailbox.id)}
                />
              ))
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <div className="border-dynamic border-t p-2">
        <Button
          className="w-full justify-start"
          onClick={() => setSettingsOpen(true)}
          variant="ghost"
        >
          <Settings className="size-4" />
          {t('settings')}
        </Button>
      </div>
      <MailSettingsDialog
        mailbox={activeMailbox}
        onOpenChange={setSettingsOpen}
        open={settingsOpen}
        workspaceId={workspaceId}
      />
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
      aria-current={active ? 'true' : undefined}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-xl border border-transparent px-2.5 py-2.5 text-left text-sm transition hover:bg-accent',
        active && 'border-foreground/10 bg-accent shadow-sm'
      )}
      onClick={onClick}
      type="button"
    >
      <Icon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          {mailbox.displayName}
        </span>
        <span className="block truncate text-muted-foreground text-xs">
          {mailbox.address}
        </span>
      </span>
      {mailbox.unreadCount > 0 ? (
        <span className="rounded-full bg-foreground px-2 py-0.5 text-background text-xs tabular-nums">
          {mailbox.unreadCount}
        </span>
      ) : null}
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
    <IconTooltip label={`${mailbox.displayName} · ${mailbox.address}`}>
      <Button
        className={cn(
          'size-10 font-semibold text-xs',
          active && 'bg-foreground text-background'
        )}
        onClick={onClick}
        size="icon"
        variant="ghost"
      >
        {mailbox.displayName.trim().charAt(0).toUpperCase() || (
          <Mail className="size-4" />
        )}
      </Button>
    </IconTooltip>
  );
}

function IconTooltip({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
