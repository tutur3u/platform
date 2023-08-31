'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { WorkspacePreset } from '@/types/primitives/WorkspacePreset';

export interface NavLink {
  name: string;
  href: string;
  matchExact?: boolean;
  aliases?: string[];
  disabled?: boolean;
  requireRootWorkspace?: boolean;
  allowedPresets?: WorkspacePreset[];
}

interface Props {
  currentWsId?: string;
  currentPreset?: WorkspacePreset;
  navLinks: NavLink[];
}

export function Navigation({ currentWsId, currentPreset, navLinks }: Props) {
  const pathname = usePathname();
  
  const rootWorkspaceId = '00000000-0000-0000-0000-000000000000';
  const isRootWorkspace = currentWsId === rootWorkspaceId;

  return (
    <>
      {navLinks.map((link) => {
        // If the link is disabled, don't render it
        if (link?.disabled) return null;

        // If the link requires the root workspace, render accordingly
        if (link?.requireRootWorkspace && !isRootWorkspace) return null;

        // If the link is only allowed for certain presets, check if the current preset is allowed
        if (
          currentPreset !== 'ALL' &&
          currentPreset !== undefined &&
          link?.allowedPresets?.includes(currentPreset) === false
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

        return (
          <Link
            className={`${
              isActive
                ? 'text-foreground border-foreground/10 bg-foreground/10'
                : 'text-foreground/30 hover:text-foreground hover:border-foreground/5 hover:bg-foreground/5 border-transparent'
            } rounded-full border px-3 py-1 transition duration-300`}
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
