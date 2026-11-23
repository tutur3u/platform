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
      className={cn('group flex flex-col gap-y-0.5', 'p-2', className)}
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
              {/* The rail keeps the label's space, so items sit at the same
                  height in the rail and the expanded panel. */}
              {shouldShowSectionLabel && (
                <div
                  aria-hidden={isCollapsed || undefined}
                  className={cn(
                    'px-4 pt-3 pb-1 first:pt-0',
                    isCollapsed && 'invisible'
                  )}
                >
                  <span className="block truncate font-semibold text-[11px] text-muted-foreground/80 uppercase tracking-wider">
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
  tightEnd = false,
}: {
  isCollapsed: boolean;
  isActive?: boolean;
  isDisabled?: boolean;
  /** Less end padding for an item that shares its row with other controls. */
  tightEnd?: boolean;
}) {
  return cn(
    'group/navlink flex w-full cursor-pointer items-center rounded-md py-2 font-medium text-sm',
    // Rail and panel rows share a height, a left edge and an icon slot
    // (`--sidebar-rail-slot`, see SidebarNavigationItemContent), so
    // expanding moves no icon: only the label and trailing controls appear.
    isCollapsed
      ? 'flex-col justify-center px-0'
      : cn('justify-between pl-0', tightEnd ? 'pr-1' : 'pr-2'),
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
        isCollapsed
          ? 'min-h-5 w-full flex-col justify-center gap-1'
          : 'flex-1 gap-0'
      )}
    >
      {icon && (
        <span
          className={cn(
            'flex shrink-0 justify-center',
            // The expanded icon sits in the rail's icon column, centered, so
            // it keeps the exact position it has in the collapsed rail.
            isCollapsed ? 'w-full' : 'w-[var(--sidebar-rail-slot,2.9375rem)]'
          )}
        >
          {icon}
        </span>
      )}
      <span
        data-slot="sidebar-item-label"
        className={cn(
          'truncate',
          // Pull the label back toward the icon: the slot is wider than the
          // icon, and this restores the previous icon-to-label gap.
          !isCollapsed && '-ml-2',
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
