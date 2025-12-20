'use client';

import type { User } from '@tuturuuu/types/primitives/User';
import { isValidTuturuuuEmail } from '@tuturuuu/utils/email/client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { DEV_MODE, PROD_MODE } from '@/constants/common';

export interface NavLink {
  title: string;
  trailing?: string | ReactNode;
  icon?: ReactNode;
  href: string;
  newTab?: boolean;
  forceRefresh?: boolean;
  matchExact?: boolean;
  aliases?: string[];
  disabled?: boolean;
  showDisabled?: boolean;
  disableOnProduction?: boolean;
  requireRootMember?: boolean;
  pinned?: boolean;
  createdAt?: string;
}

interface Props {
  currentWsId?: string;
  currentRole?: string;
  currentUser?: User | null;
  navLinks: NavLink[];
}

export function Navigation({ currentWsId, currentUser, navLinks }: Props) {
  const pathname = usePathname();

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

        const links = [...(link.aliases || []), link.href];
        const matchExact = link.matchExact ?? false;

        const isActive =
          links
            .map((href) =>
              matchExact
                ? pathname === href
                : (pathname?.startsWith(href) ?? false)
            )
            .filter(Boolean).length > 0;

        const isDevOnly = link.disableOnProduction;

        const enableUnderline = false;
        const notPublic = DEV_MODE && isDevOnly;

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
              isActive
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
            href={link.forceRefresh ? '/new' : link.href}
          >
            {link.title}
          </Link>
        );
      })}
    </div>
  );
}
