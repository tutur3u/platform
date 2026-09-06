'use client';

import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';
import type { NavLink as NavLinkType } from './navigation';

export interface SidebarNavigationProps {
  isCollapsed: boolean;
  links: (NavLinkType | null)[];
  className?: string;
  label?: string;
  renderLink: (link: NavLinkType) => ReactNode;
}
export function SidebarNavigation({
  links,
  isCollapsed,
  className,
  label,
  renderLink,
}: SidebarNavigationProps) {
  if (!links?.length) {
    return null;
  }

  return (
    <div
      data-collapsed={isCollapsed}
      className={cn('group flex flex-col gap-y-0.5 p-2', className)}
    >
      <nav aria-label={label} className="grid gap-y-0.5">
        {links.map((link, index) => {
          if (!link) {
            return (
              <div
                key={`nav-divider-${index}`}
                className={cn(
                  'my-1 border-b',
                  isCollapsed ? 'mx-auto w-1/2' : 'w-auto'
                )}
              />
            );
          }

          const previousSectionLabel = links
            .slice(0, index)
            .reverse()
            .find((previousLink) => previousLink)?.sectionLabel;
          const shouldShowSectionLabel =
            link.sectionLabel && link.sectionLabel !== previousSectionLabel;

          return (
            <div key={`nav-item-${link.href || link.title}-${index}`}>
              {shouldShowSectionLabel && !isCollapsed && (
                <div className="px-2 pt-3 pb-1 first:pt-0">
                  <span className="font-semibold text-[11px] text-muted-foreground/80 uppercase tracking-wider">
                    {link.sectionLabel}
                  </span>
                </div>
              )}
              {renderLink(link)}
            </div>
          );
        })}
      </nav>
    </div>
  );
}

export function satelliteNavigationItemClass({
  isCollapsed,
  isActive,
  isDisabled,
}: {
  isCollapsed: boolean;
  isActive?: boolean;
  isDisabled?: boolean;
}) {
  return cn(
    'group/navlink flex w-full cursor-pointer items-center justify-between rounded-md p-2 font-medium text-sm',
    isCollapsed && 'justify-center',
    isActive && 'bg-accent text-accent-foreground',
    isDisabled
      ? 'cursor-not-allowed opacity-50'
      : 'hover:bg-accent hover:text-accent-foreground'
  );
}
