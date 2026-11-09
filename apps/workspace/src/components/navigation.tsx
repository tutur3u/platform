'use client';

import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { isValidTuturuuuEmail } from '@tuturuuu/utils/email/client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { DEV_MODE, PROD_MODE } from '@/constants/common';

export type { NavLink } from '@tuturuuu/ui/custom/navigation';

interface Props {
  currentWsId?: string;
  currentUser?: WorkspaceUser | null;
  navLinks: NavLink[];
}

export function Navigation({ currentWsId, currentUser, navLinks }: Props) {
  const pathname = usePathname();
  const isRootWorkspace = currentWsId === ROOT_WORKSPACE_ID;

  const scrollActiveLinksIntoView = useCallback(() => {
    const activeWorkspaceLink = document.getElementById('active-ws-navlink');
    const activeLink = document.getElementById('active-navlink');

    if (activeWorkspaceLink) {
      activeWorkspaceLink.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
    }

    if (activeLink) {
      new Promise((resolve) => setTimeout(resolve, 500)).then(() =>
        activeLink.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'nearest',
        })
      );
    }
  }, []);

  const [urlToLoad, setUrlToLoad] = useState<string>();

  useEffect(() => {
    if (urlToLoad) setUrlToLoad(undefined);
    scrollActiveLinksIntoView();
  }, [urlToLoad, scrollActiveLinksIntoView]);

  return (
    <div className="scrollbar-none mb-4 flex flex-none gap-1 overflow-x-auto font-semibold">
      {navLinks.map((link) => {
        // If the link is disabled, don't render it
        if (link?.disabled) return null;

        // If the link is disabled on production, don't render it
        if (link?.disableOnProduction && PROD_MODE) return null;

        // If the link requires root membership, check if user email ends with @tuturuuu.com
        if (
          link?.requireRootMember &&
          !isValidTuturuuuEmail(currentUser?.email)
        )
          return null;

        // If the link requires the root workspace, check if the current workspace is the root workspace
        if (link?.requireRootWorkspace && !isRootWorkspace) return null;

        const links = [...(link.aliases || []), link.href];
        const matchExact = link.matchExact ?? false;

        const isActive =
          links
            .map((href) =>
              href
                ? matchExact
                  ? pathname === href
                  : ((pathname?.startsWith(href) &&
                      link?.excludePaths?.every(
                        (path) => !path.includes(pathname)
                      )) ??
                    false)
                : false
            )

            .filter(Boolean).length > 0;

        const isDevOnly = link.disableOnProduction;
        const isRootOnly = link.requireRootWorkspace;

        const enableUnderline = false;
        const notPublic = DEV_MODE && (isDevOnly || isRootOnly);

        return (
          <Link
            key={`${link.title}-${link.href}`}
            id={
              isActive && currentWsId
                ? 'active-ws-navlink'
                : isActive
                  ? 'active-navlink'
                  : undefined
            }
            className={`text-sm md:text-base ${
              link.tempDisabled
                ? 'cursor-not-allowed opacity-50'
                : isActive
                  ? 'border-border bg-foreground/2.5 text-foreground dark:bg-foreground/5'
                  : urlToLoad === link.href
                    ? 'animate-pulse bg-foreground/5 text-foreground/70 dark:text-foreground/40'
                    : 'border-transparent text-foreground/70 md:hover:bg-foreground/5 md:hover:text-foreground dark:text-foreground/40'
            } ${
              enableUnderline && notPublic
                ? 'underline decoration-dashed underline-offset-4'
                : ''
            } flex-none rounded-lg border px-3 py-1 transition`}
            onClick={() => {
              setUrlToLoad(link.href);
              if (isActive) scrollActiveLinksIntoView();
            }}
            href={link.href ?? '#'}
          >
            {link.title}
          </Link>
        );
      })}
    </div>
  );
}
