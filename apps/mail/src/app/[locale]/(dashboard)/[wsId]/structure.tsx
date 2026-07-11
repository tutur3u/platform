'use client';

import { SidebarStructure } from '@tuturuuu/satellite/sidebar-structure';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { TuturuuLogo } from '@tuturuuu/ui/custom/tuturuuu-logo';
import { usePathname, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { TTR_URL } from '@/constants/common';
import { MailBrand } from './mail-brand';
import { getMailFolderHref, isMailFolder } from './mail-folders';
import { MailSidebarPanel } from './mail-sidebar-panel';

interface StructureProps {
  actions: ReactNode;
  children: ReactNode;
  defaultCollapsed: boolean;
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
  links,
  personalOrWsId,
  userPopover,
  workspace,
  wsId,
}: StructureProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mailHomeHref = getMailFolderHref(personalOrWsId, 'inbox');
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
        <MailBrand
          centralHref={TTR_URL}
          className="flex-1"
          mailHref={mailHomeHref}
        />
      }
      brandHref={TTR_URL}
      collapsedBrand={
        <TuturuuLogo alt="" className="size-8" height={32} width={32} />
      }
      defaultCollapsed={defaultCollapsed}
      links={[]}
      mobileBrand={<MailBrand centralHref={TTR_URL} mailHref={mailHomeHref} />}
      sidebarContentAfter={({ closeOnMobile, isCollapsed }) => (
        <MailSidebarPanel
          closeOnMobile={closeOnMobile}
          folderLinks={enhancedLinks}
          isCollapsed={isCollapsed}
          onCompose={openCompose}
          workspaceId={personalOrWsId}
        />
      )}
      sidebarExpandedWidth="18rem"
      sidebarHeaderClassName="border-foreground/10 border-b"
      linkBrand={false}
      upgradeExternal
      upgradeHref={`${TTR_URL}/${wsId}/billing`}
      userPopover={userPopover}
      workspace={workspace}
      wsId={wsId}
    >
      {children}
    </SidebarStructure>
  );
}
