'use client';

import { DEV_MODE, PROD_MODE, ROOT_WORKSPACE_ID } from '@/constants/common';
import { User } from '@/types/primitives/User';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

export interface NavLink {
  name: string;
  href: string;
  forceRefresh?: boolean;
  matchExact?: boolean;
  aliases?: string[];
  disabled?: boolean;
  disableOnProduction?: boolean;
  requireRootMember?: boolean;
  requireRootWorkspace?: boolean;
  allowedRoles?: string[];
  disabledRoles?: string[];
}

interface Props {
  currentWsId?: string;
  currentRole?: string;
  currentUser?: User | null;
  navLinks: NavLink[];
}

export function Navigation({
  currentWsId,
  currentRole,
  currentUser,
  navLinks,
}: Props) {
  const pathname = usePathname();
  const isRootWorkspace = currentWsId === ROOT_WORKSPACE_ID;

  const scrollActiveLinksIntoView = () => {
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
  };

  useEffect(() => {
    scrollActiveLinksIntoView();
  }, [pathname]);

  return (
    <>
      {navLinks.map((link) => {
        // If the link is disabled, don't render it
        if (link?.disabled) return null;

        // If the link is disabled on production, don't render it
        if (link?.disableOnProduction && PROD_MODE) return null;

        // If the link requires root membership, check if user email ends with @tuturuuu.com
        if (
          link?.requireRootMember &&
          !currentUser?.email?.endsWith('@tuturuuu.com')
        )
          return null;

        // If the link requires the root workspace, check if the current workspace is the root workspace
        if (link?.requireRootWorkspace && !isRootWorkspace) return null;

        // If the link is only allowed for certain roles, check if the current role is allowed
        if (
          currentRole &&
          link?.allowedRoles &&
          link.allowedRoles.length > 0 &&
          (link?.allowedRoles?.includes(currentRole) === false ||
            link?.disabledRoles?.includes(currentRole) === true)
        )
          return null;

        const links = [...(link.aliases || []), link.href];
        const matchExact = link.matchExact ?? false;

        const isActive =
          links
            .map((href) =>
              matchExact
                ? pathname === href
                : pathname?.startsWith(href) ?? false
            )
            .filter(Boolean).length > 0;

        const isDevOnly = link.disableOnProduction;
        const isRootOnly = link.requireRootWorkspace;

        const enableUnderline = false;
        const notPublic = DEV_MODE && (isDevOnly || isRootOnly);

        return (
          <Link
            id={
              isActive && currentWsId
                ? 'active-ws-navlink'
                : isActive
                  ? 'active-navlink'
                  : undefined
            }
            className={`text-sm md:text-base ${
              isActive
                ? 'text-foreground border-border bg-foreground/[0.025] dark:bg-foreground/5'
                : 'text-foreground/70 dark:text-foreground/40 md:hover:text-foreground md:hover:bg-foreground/5 border-transparent'
            } ${
              enableUnderline && notPublic
                ? 'underline decoration-dashed underline-offset-4'
                : ''
            } flex-none rounded-full border px-3 py-1 transition duration-300`}
            onClick={() => {
              if (isActive) scrollActiveLinksIntoView();
            }}
            href={link.forceRefresh ? `${link.href}?refresh=true` : link.href}
            key={link.name}
          >
            {link.name}
          </Link>
        );
      })}
    </>
  );
}
