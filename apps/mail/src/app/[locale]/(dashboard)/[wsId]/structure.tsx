'use client';

import { Mail } from '@tuturuuu/icons';
import { SidebarStructure } from '@tuturuuu/satellite/sidebar-structure';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { TTR_URL } from '@/constants/common';
import { getMailFolderHref, isMailFolder } from './mail-folders';
import { MailSidebarPanel } from './mail-sidebar-panel';
import { WorkspaceSelect } from './workspace-select';

interface StructureProps {
  actions: ReactNode;
  children: ReactNode;
  defaultCollapsed: boolean;
  disableCreateNewWorkspace?: boolean;
  links: (NavLink | null)[];
  personalOrWsId: string;
  userPopover: ReactNode;
  workspace: { tier?: string | null } | null;
  wsId: string;
}

export function Structure({
  actions,
  children,
  defaultCollapsed = false,
  disableCreateNewWorkspace,
  links,
  personalOrWsId,
  userPopover,
  workspace,
  wsId,
}: StructureProps) {
  const t = useTranslations('mail');
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const enhancedLinks = useMemo(
    () =>
      links.map((link) => {
        if (!link) return null;

        const folder = link.id?.replace('mail.folder.', '');
        if (!folder || !isMailFolder(folder)) return link;

        const href = getMailFolderHref(personalOrWsId, folder);
        const nextParams = new URLSearchParams();
        const mailbox = searchParams.get('mailbox');
        const query = searchParams.get('q');

        if (mailbox) nextParams.set('mailbox', mailbox);
        if (query) nextParams.set('q', query);

        const nextQuery = nextParams.toString();

        return {
          ...link,
          aliases: [href],
          href: nextQuery ? `${href}?${nextQuery}` : href,
          matchExact: true,
        };
      }),
    [links, personalOrWsId, searchParams]
  );

  function openCompose() {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('compose', '1');
    const nextQuery = nextParams.toString();

    window.history.replaceState(
      null,
      '',
      nextQuery ? `${pathname}?${nextQuery}` : pathname
    );
  }

  return (
    <SidebarStructure
      actions={actions}
      brand={
        <>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-dynamic bg-foreground/5">
            <Mail className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1 truncate font-semibold text-base">
            {t('title')}
          </span>
        </>
      }
      collapsedBrand={
        <span className="flex h-9 w-9 items-center justify-center rounded-md border border-dynamic bg-foreground/5">
          <Mail className="h-4 w-4" />
        </span>
      }
      defaultCollapsed={defaultCollapsed}
      links={enhancedLinks}
      mobileBrand={
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-dynamic bg-foreground/5">
            <Mail className="h-4 w-4" />
          </span>
          <span className="truncate font-semibold">{t('title')}</span>
        </span>
      }
      sidebarContentAfter={({ closeOnMobile, isCollapsed }) => (
        <MailSidebarPanel
          closeOnMobile={closeOnMobile}
          isCollapsed={isCollapsed}
          onCompose={openCompose}
          workspaceId={personalOrWsId}
        />
      )}
      sidebarExpandedWidth="18.5rem"
      sidebarHeaderClassName="border-foreground/10 border-b"
      upgradeExternal
      upgradeHref={`${TTR_URL}/${wsId}/billing`}
      userPopover={userPopover}
      workspace={workspace}
      workspaceSelect={({ isCollapsed }) => (
        <WorkspaceSelect
          disableCreateNewWorkspace={disableCreateNewWorkspace}
          hideLeading={isCollapsed}
          wsId={wsId}
        />
      )}
      wsId={wsId}
    >
      {children}
    </SidebarStructure>
  );
}
