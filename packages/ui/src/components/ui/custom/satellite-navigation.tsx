'use client';

import { ChevronDown } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { type ReactNode, useId } from 'react';
import { isNavLinkActive } from './nav-link-matching';
import type { NavLink as NavLinkType } from './navigation';
import { useCollapsedSidebarSections } from './sidebar-collapsed-sections';

export interface SidebarNavigationProps {
  isCollapsed: boolean;
  links: (NavLinkType | null)[];
  className?: string;
  label?: string;
  /**
   * Group links by `sectionId` into collapsible sections whose open state is
   * remembered. Off by default: other apps keep the plain label-change headers.
   */
  collapsibleSections?: boolean;
  /**
   * Current route pathname injected by the framework adapter so collapsed
   * sections keep the active item visible without coupling this component to
   * a router implementation.
   */
  pathname?: string;
  renderLink: (link: NavLinkType) => ReactNode;
}

type SidebarBlock =
  | { type: 'divider'; index: number }
  | { type: 'item'; index: number; link: NavLinkType }
  | {
      type: 'section';
      collapsible: boolean;
      id: string;
      items: NavLinkType[];
      label?: string;
    };

function groupSidebarBlocks(links: (NavLinkType | null)[]): SidebarBlock[] {
  const blocks: SidebarBlock[] = [];

  links.forEach((link, index) => {
    if (!link) {
      blocks.push({ type: 'divider', index });
      return;
    }

    const sectionKey = link.sectionId ?? link.sectionLabel;
    if (!sectionKey) {
      blocks.push({ type: 'item', index, link });
      return;
    }

    const previous = blocks.at(-1);
    if (previous?.type === 'section' && previous.id === sectionKey) {
      previous.items.push(link);
      return;
    }

    blocks.push({
      type: 'section',
      collapsible: Boolean(link.sectionCollapsible && link.sectionLabel),
      id: sectionKey,
      items: [link],
      label: link.sectionLabel,
    });
  });

  return blocks;
}

function SidebarDivider({ isCollapsed }: { isCollapsed: boolean }) {
  return (
    <div
      className={cn('my-1 border-b', isCollapsed ? 'mx-auto w-1/2' : 'w-auto')}
    />
  );
}

function CollapsibleSidebarSection({
  block,
  isCollapsed,
  isFirst,
  isOpen,
  onToggle,
  pathname,
  renderLink,
}: {
  block: Extract<SidebarBlock, { type: 'section' }>;
  isCollapsed: boolean;
  isFirst: boolean;
  isOpen: boolean;
  onToggle: () => void;
  pathname: string;
  renderLink: (link: NavLinkType) => ReactNode;
}) {
  const contentId = useId();

  // The icon-only rail has no room for the header text but keeps its space,
  // so every icon sits at the same height as in the expanded panel. A thin
  // divider in that space separates the categories, and every app stays
  // reachable.
  if (isCollapsed) {
    return (
      <>
        {block.label && (
          <div
            aria-hidden
            className={cn('relative pb-1', isFirst ? 'pt-0' : 'pt-3')}
          >
            {!isFirst && (
              <span className="absolute inset-x-2 top-1.5 border-border border-t" />
            )}
            <span className="invisible block truncate px-4 font-semibold text-[11px] uppercase tracking-wider">
              {block.label}
            </span>
          </div>
        )}
        {block.items.map((link, index) => (
          <div key={`nav-item-${link.id ?? link.href ?? link.title}-${index}`}>
            {renderLink(link)}
          </div>
        ))}
      </>
    );
  }

  // A collapsed section still shows the page the user is on, so the active
  // item never disappears from the sidebar.
  const visibleItems =
    isOpen || !block.collapsible
      ? block.items
      : block.items.filter((link) => isNavLinkActive(link, pathname));

  return (
    <section
      data-section-id={block.id}
      data-state={isOpen ? 'open' : 'closed'}
      className="grid gap-y-0.5"
    >
      {block.label &&
        (block.collapsible ? (
          <button
            type="button"
            aria-controls={contentId}
            aria-expanded={isOpen}
            className={cn(
              'flex w-full items-center justify-between rounded-md px-4 pb-1 font-semibold text-[11px] text-muted-foreground/80 uppercase tracking-wider transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isFirst ? 'pt-0' : 'pt-3'
            )}
            onClick={onToggle}
          >
            <span>{block.label}</span>
            <ChevronDown
              aria-hidden
              className={cn(
                'h-3 w-3 transition-transform',
                !isOpen && '-rotate-90'
              )}
            />
          </button>
        ) : (
          <div className={cn('px-4 pb-1', isFirst ? 'pt-0' : 'pt-3')}>
            <span className="font-semibold text-[11px] text-muted-foreground/80 uppercase tracking-wider">
              {block.label}
            </span>
          </div>
        ))}
      <div id={contentId} className="grid gap-y-0.5">
        {visibleItems.map((link, index) => (
          <div key={`nav-item-${link.id ?? link.href ?? link.title}-${index}`}>
            {renderLink(link)}
          </div>
        ))}
      </div>
    </section>
  );
}

function CollapsibleSidebarSections({
  links,
  isCollapsed,
  pathname,
  renderLink,
}: Pick<SidebarNavigationProps, 'links' | 'isCollapsed' | 'renderLink'> & {
  pathname: string;
}) {
  const { collapsedIds, toggleSection } = useCollapsedSidebarSections();
  const blocks = groupSidebarBlocks(links);

  return (
    <>
      {blocks.map((block, blockIndex) => {
        if (block.type === 'divider') {
          return (
            <SidebarDivider
              key={`nav-divider-${block.index}`}
              isCollapsed={isCollapsed}
            />
          );
        }

        if (block.type === 'item') {
          return (
            <div
              key={`nav-item-${block.link.href || block.link.title}-${block.index}`}
            >
              {renderLink(block.link)}
            </div>
          );
        }

        return (
          <CollapsibleSidebarSection
            key={`nav-section-${block.id}`}
            block={block}
            isCollapsed={isCollapsed}
            isFirst={blockIndex === 0}
            isOpen={!collapsedIds.includes(block.id)}
            onToggle={() => toggleSection(block.id)}
            pathname={pathname}
            renderLink={renderLink}
          />
        );
      })}
    </>
  );
}

export function SidebarNavigation({
  links,
  isCollapsed,
  className,
  label,
  collapsibleSections = false,
  pathname = '',
  renderLink,
}: SidebarNavigationProps) {
  if (!links?.length) {
    return null;
  }

  if (collapsibleSections) {
    return (
      <div
        data-collapsed={isCollapsed}
        className={cn('group flex flex-col gap-y-0.5', 'p-2', className)}
      >
        <nav aria-label={label} className="grid grid-cols-1 gap-y-0.5">
          <CollapsibleSidebarSections
            links={links}
            isCollapsed={isCollapsed}
            pathname={pathname}
            renderLink={renderLink}
          />
        </nav>
      </div>
    );
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
