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
      className={cn(
        'group flex flex-col gap-y-0.5',
        isCollapsed ? 'px-1 py-2' : 'p-2',
        className
      )}
    >
      <nav aria-label={label} className="grid grid-cols-1 gap-y-0.5">
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
    'group/navlink flex w-full cursor-pointer items-center rounded-md py-2 font-medium text-sm',
    isCollapsed ? 'flex-col justify-center px-1' : 'justify-between px-2',
    isActive && 'bg-accent text-accent-foreground',
    isDisabled
      ? 'cursor-not-allowed opacity-50'
      : 'hover:bg-accent hover:text-accent-foreground'
  );
}

/**
 * Icon and title of a sidebar item. The collapsed rail (collapsed, or resting
 * in expand-on-hover) shows icons only; the item's tooltip and accessible name
 * carry the title. When the user turns on Settings → Sidebar → Show navigation
 * labels (`nav-labels.ts`), the title returns as a one-line caption under the
 * icon. The caption stays in the markup either way, so the choice applies from
 * `<html>` before hydration without shifting the rail.
 */
export function SidebarNavigationItemContent({
  icon,
  title,
  isCollapsed,
  isActive,
}: {
  icon?: ReactNode;
  title: string;
  isCollapsed: boolean;
  isActive?: boolean;
}) {
  return (
    <span
      className={cn(
        'flex min-w-0 items-center',
        isCollapsed ? 'w-full flex-col gap-1' : 'flex-1 gap-2'
      )}
    >
      {icon && <span className="flex shrink-0">{icon}</span>}
      <span
        data-slot="sidebar-item-label"
        className={cn(
          'truncate',
          isCollapsed &&
            'hidden max-w-full text-[10px] leading-normal nav-labels:block',
          isCollapsed &&
            !isActive &&
            'text-muted-foreground group-hover/navlink:text-current group-focus-visible/navlink:text-current'
        )}
      >
        {title}
      </span>
    </span>
  );
}
