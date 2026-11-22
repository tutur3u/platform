'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Mail, PenLine, Settings } from '@tuturuuu/icons';
import { listMailThreads } from '@tuturuuu/internal-api';
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
import { parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs';
import type { ReactNode } from 'react';
import { useConnectedMailAccounts } from './connected-mail-accounts';
import { MailAccountPicker } from './mail-account-picker';
import { isMailFolder } from './mail-folders';
import { retryMailRead } from './mail-read-query';
import { MailSettingsDialog } from './mail-settings-dialog';
import { useConnectedByDefault, useMailSource } from './mail-source';
import {
  applyMailSelection,
  getSourceFolderHref,
  isConnectedMailFolder,
  type MailSelection,
  resolveConnectedAccountId,
  resolveSelectionPathname,
} from './mail-source-selection';
import {
  getMailThreadsQueryKey,
  getNextMailThreadPage,
  MAIL_THREAD_PAGE_SIZE,
} from './mail-thread-query';
import { useMailboxSelection } from './mailbox-selection';

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
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    activeMailbox,
    activeMailboxId,
    bootstrapQuery,
    mailboxes,
    organizationQuery,
  } = useMailboxSelection();
  const { source, accountId: requestedAccountId } = useMailSource();
  const connectedByDefault = useConnectedByDefault();
  const { query: accountsQuery } = useConnectedMailAccounts(workspaceId);
  const connectedAccounts = accountsQuery.data ?? [];
  const activeAccountId = resolveConnectedAccountId(
    accountsQuery.data,
    requestedAccountId
  );
  const managed = source === 'managed';
  const [mailSettings, setMailSettings] = useQueryState(
    'mailSettings',
    parseAsStringLiteral(['open']).withOptions({
      history: 'replace',
      shallow: true,
      scroll: false,
    })
  );
  const [, setMailSettingsTab] = useQueryState(
    'mailSettingsTab',
    parseAsString.withOptions({
      history: 'replace',
      shallow: true,
      scroll: false,
    })
  );
  const settingsOpen = mailSettings === 'open';
  const setSettingsOpen = (open: boolean) => {
    void setMailSettings(open ? 'open' : null);
  };
  const customFolders = (
    managed ? (organizationQuery.data?.folders ?? []) : []
  ).filter((folder) => folder.kind === 'custom');
  const customLabels = (
    managed ? (organizationQuery.data?.labels ?? []) : []
  ).filter((label) => label.kind === 'custom');

  const selectSource = (selection: MailSelection) => {
    const params = applyMailSelection(
      searchParams.toString(),
      selection,
      connectedByDefault
    );
    const nextPath = resolveSelectionPathname(pathname, selection);
    window.history.replaceState(null, '', `${nextPath}?${params}`);
    closeOnMobile?.();
  };
  const manageAccounts = () => {
    void setMailSettingsTab('source');
    setSettingsOpen(true);
    closeOnMobile?.();
  };
  const compose = () => {
    onCompose();
    closeOnMobile?.();
  };
  const getFolderHref = (href: string | undefined) =>
    getSourceFolderHref({
      accountId: activeAccountId,
      composing: searchParams.get('compose') === '1',
      href,
      mailboxId: activeMailboxId,
      source,
    });
  const visibleFolderLinks = folderLinks.filter(
    (link): link is NavLink =>
      Boolean(link) &&
      (managed || isConnectedMailFolder(link?.id?.replace('mail.folder.', '')))
  );
  const prefetchFolder = (href: string | undefined) => {
    if (!href || !managed || !activeMailboxId) return;
    const folder = href.split('?')[0]?.split('/').filter(Boolean).at(-1);
    if (!folder || !isMailFolder(folder)) return;
    void queryClient.prefetchInfiniteQuery({
      getNextPageParam: getNextMailThreadPage,
      initialPageParam: 1,
      queryFn: ({ pageParam }) =>
        listMailThreads(workspaceId, activeMailboxId, {
          folder,
          page: pageParam,
          pageSize: MAIL_THREAD_PAGE_SIZE,
        }),
      queryKey: getMailThreadsQueryKey({
        folder,
        mailboxId: activeMailboxId,
        workspaceId,
      }),
      retry: retryMailRead,
      staleTime: 30_000,
    });
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
        {visibleFolderLinks.map((link) => {
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
                <Link
                  aria-current={
                    pathname === link.href?.split('?')[0] ? 'page' : undefined
                  }
                  href={getFolderHref(link.href)}
                  onFocus={() => prefetchFolder(link.href)}
                  onPointerEnter={() => prefetchFolder(link.href)}
                  prefetch
                >
                  {link.icon}
                </Link>
              </Button>
            </IconTooltip>
          );
        })}
        <div className="flex-1" />
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
          mailbox={activeMailbox ?? null}
          onOpenChange={setSettingsOpen}
          onSelectMailbox={(mailboxId) =>
            selectSource({ kind: 'managed', mailboxId })
          }
          open={settingsOpen}
          workspaceId={workspaceId}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 p-3">
        <Button
          className="h-10 w-full justify-start rounded-lg px-3 shadow-elevation-1"
          onClick={compose}
        >
          <PenLine className="size-4" /> {t('compose')}
        </Button>
        <MailAccountPicker
          onManage={manageAccounts}
          onSelect={selectSource}
          state={{
            accountId: activeAccountId,
            accounts: connectedAccounts,
            loading: bootstrapQuery.isLoading || accountsQuery.isLoading,
            mailboxId: activeMailboxId,
            mailboxes,
            source,
          }}
        />
      </div>
      <Accordion
        className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-2"
        defaultValue={['folders']}
        type="multiple"
      >
        <AccordionItem className="border-0" value="folders">
          <AccordionTrigger className="px-2 py-2 font-medium text-muted-foreground text-xs">
            {t('folders')}
          </AccordionTrigger>
          <AccordionContent className="space-y-0.5 pb-2">
            {visibleFolderLinks.map((link) =>
              link ? (
                <Link
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    pathname === link.href?.split('?')[0] &&
                      'bg-accent font-semibold'
                  )}
                  aria-current={
                    pathname === link.href?.split('?')[0] ? 'page' : undefined
                  }
                  href={getFolderHref(link.href)}
                  key={link.id}
                  onClick={closeOnMobile}
                  onFocus={() => prefetchFolder(link.href)}
                  onPointerEnter={() => prefetchFolder(link.href)}
                  prefetch
                >
                  {link.icon}
                  <span className="min-w-0 flex-1">{link.title}</span>
                  {managed &&
                  link.id === 'mail.folder.inbox' &&
                  activeMailbox?.unreadCount ? (
                    <span className="rounded-full bg-foreground px-2 py-0.5 text-background text-xs tabular-nums">
                      {activeMailbox.unreadCount}
                    </span>
                  ) : null}
                </Link>
              ) : null
            )}
            {customFolders.map((folder) => (
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
        {managed ? (
          <AccordionItem className="border-0" value="labels">
            <AccordionTrigger className="px-2 py-2 font-medium text-muted-foreground text-xs">
              <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                <span>{t('labels')}</span>
                {customLabels.length > 0 ? (
                  <span className="tabular-nums">{customLabels.length}</span>
                ) : null}
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-0.5 pb-2">
              {customLabels.map((label) => (
                <Link
                  className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm hover:bg-accent"
                  href={`${pathname}?mailbox=${activeMailboxId}&label=${encodeURIComponent(label.slug)}`}
                  key={label.id}
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full bg-foreground/30"
                    style={
                      label.color ? { backgroundColor: label.color } : undefined
                    }
                  />
                  <span className="truncate">{label.name}</span>
                </Link>
              ))}
              {!organizationQuery.isLoading && customLabels.length === 0 ? (
                <p className="px-2.5 py-2 text-muted-foreground text-xs">
                  {t('no_custom_labels')}
                </p>
              ) : null}
            </AccordionContent>
          </AccordionItem>
        ) : null}
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
        mailbox={activeMailbox ?? null}
        onOpenChange={setSettingsOpen}
        onSelectMailbox={(mailboxId) =>
          selectSource({ kind: 'managed', mailboxId })
        }
        open={settingsOpen}
        workspaceId={workspaceId}
      />
    </div>
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
