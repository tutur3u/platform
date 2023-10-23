'use client';

import { usePathname } from 'next/navigation';
import { WorkspacePreset } from '@/types/primitives/WorkspacePreset';
import { DEV_MODE, PROD_MODE, ROOT_WORKSPACE_ID } from '@/constants/common';
import { User } from '@/types/primitives/User';
import Link from 'next/link';

export interface NavLink {
  name: string;
  href: string;
  matchExact?: boolean;
  aliases?: string[];
  disabled?: boolean;
  disableOnProduction?: boolean;
  requireRootMember?: boolean;
  requireRootWorkspace?: boolean;
  allowedPresets?: WorkspacePreset[];
  allowedRoles?: string[];
  disabledPresets?: WorkspacePreset[];
  disabledRoles?: string[];
}

interface Props {
  currentWsId?: string;
  currentRole?: string;
  currentUser?: User;
  currentPreset?: WorkspacePreset;
  navLinks: NavLink[];
}

export function Navigation({
  currentWsId,
  currentRole,
  currentUser,
  currentPreset,
  navLinks,
}: Props) {
  const pathname = usePathname();
  const isRootWorkspace = currentWsId === ROOT_WORKSPACE_ID;

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

        // If the link is only allowed for certain presets, check if the current preset is allowed
        if (
          currentPreset !== 'ALL' &&
          currentPreset !== undefined &&
          (link?.allowedPresets?.includes(currentPreset) === false ||
            link?.disabledPresets?.includes(currentPreset) === true)
        )
          return null;

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
            className={`${
              isActive
                ? 'text-foreground border-foreground/10 bg-foreground/5'
                : 'text-foreground/40 md:hover:text-foreground md:hover:bg-foreground/5 border-transparent'
            } ${
              enableUnderline && notPublic
                ? 'underline decoration-dashed underline-offset-4'
                : ''
            } flex-none rounded-full border px-3 py-1 transition duration-300`}
            href={link.href}
            key={link.name}
          >
            {link.name}
          </Link>
        );
      })}
    </>
  );
}
