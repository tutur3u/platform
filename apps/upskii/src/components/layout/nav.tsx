'use client';

import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { buttonVariants } from '@tuturuuu/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { ChevronRight } from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { NavLink } from '@/components/navigation';
import { ENABLE_KEYBOARD_SHORTCUTS, PROD_MODE } from '@/constants/common';

interface NavProps {
  wsId: string;
  currentUser: WorkspaceUser | null;
  isCollapsed: boolean;
  links: (NavLink | null)[];
  onClick?: () => void;
}

export function Nav({
  wsId,
  currentUser,
  links,
  isCollapsed,
  onClick,
}: NavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const isRootWorkspace = wsId === ROOT_WORKSPACE_ID;
  const [urlToLoad, setUrlToLoad] = useState<string>();
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (urlToLoad && urlToLoad === pathname) setUrlToLoad(undefined);
  }, [pathname, searchParams]);

  function hasFocus(selector: string) {
    return Array.from(document.querySelectorAll(selector)).some(
      (el) => el === document.activeElement
    );
  }

  function parseShortcut(shortcut: string) {
    const parts = shortcut.split('+');
    return {
      ctrl: parts.includes('CTRL'),
      shift: parts.includes('SHIFT'),
      key: parts.find((part) => part.length === 1),
    };
  }

  function shouldShowLink(link: NavLink) {
    // If the link is disabled, don't render it
    if (link?.disabled) return false;

    // If the link is disabled on production, don't render it
    if (link?.disableOnProduction && PROD_MODE) return false;

    // If the link requires root membership, check if user email ends with @tuturuuu.com
    if (
      link?.requireRootMember &&
      !currentUser?.email?.endsWith('@tuturuuu.com')
    )
      return false;

    // If the link requires the root workspace, check if the current workspace is the root workspace
    if (link?.requireRootWorkspace && !isRootWorkspace) return false;

    // If the link is only allowed for certain roles, check if the current role is allowed
    if (link?.allowedRoles && link.allowedRoles.length > 0) return false;

    return true;
  }

  function isLinkActive(link: NavLink) {
    if (!link.href && !link.children) return false;

    const links = [...(link.aliases || []), link.href].filter(Boolean);
    const matchExact = link.matchExact ?? false;

    if (link.href) {
      return (
        links
          .map(
            (href) =>
              typeof href === 'string' &&
              (matchExact
                ? pathname === href
                : (pathname?.startsWith(href) ?? false))
          )
          .filter(Boolean).length > 0
      );
    }

    // For grouped links, check if any child is active
    if (link.children) {
      return link.children.some((child) => {
        if (!shouldShowLink(child)) return false;
        const childLinks = [...(child.aliases || []), child.href].filter(
          Boolean
        );
        return childLinks.some(
          (href) =>
            typeof href === 'string' &&
            (child.matchExact
              ? pathname === href
              : (pathname?.startsWith(href) ?? false))
        );
      });
    }

    return false;
  }

  // Collect all links for keyboard shortcuts
  const allLinks = links.reduce((acc: NavLink[], link) => {
    if (!link) return acc;
    if (!shouldShowLink(link)) return acc;

    if (link.children) {
      const visibleChildren = link.children.filter(shouldShowLink);
      acc.push(...visibleChildren);
    } else if (link.href) {
      acc.push(link);
    }

    return acc;
  }, []);

  useEffect(() => {
    function down(e: KeyboardEvent) {
      allLinks.forEach((link) => {
        if (!link || !link.shortcut || !link.href) return;
        const { ctrl, shift, key } = parseShortcut(link.shortcut);
        if (
          !hasFocus('input, select, textarea') &&
          e.key.toUpperCase() === key?.toUpperCase() &&
          ctrl === e.ctrlKey &&
          shift === e.shiftKey
        ) {
          e.preventDefault();
          if (!link.newTab && link.href.split('?')[0] !== pathname)
            setUrlToLoad(link.href.split('?')[0]);
          router.push(link.href);
        }
      });
    }

    if (ENABLE_KEYBOARD_SHORTCUTS) document.addEventListener('keydown', down);

    return () => {
      if (ENABLE_KEYBOARD_SHORTCUTS)
        document.removeEventListener('keydown', down);
    };
  }, [allLinks, pathname]);

  // Auto-expand groups with active children
  useEffect(() => {
    const newOpenGroups = new Set<string>();
    links.forEach((link, idx) => {
      if (link && link.children && isLinkActive(link)) {
        newOpenGroups.add(`group-${idx}`);
      }
    });
    setOpenGroups(newOpenGroups);
  }, [pathname, links]);

  function toggleGroup(groupKey: string) {
    const newOpenGroups = new Set(openGroups);
    if (newOpenGroups.has(groupKey)) {
      newOpenGroups.delete(groupKey);
    } else {
      newOpenGroups.add(groupKey);
    }
    setOpenGroups(newOpenGroups);
  }

  function renderLink(link: NavLink, key: string) {
    const isActive = isLinkActive(link);

    if (isCollapsed) {
      return (
        <Tooltip key={key} delayDuration={0}>
          <TooltipTrigger asChild>
            <Link
              scroll={false}
              href={link.href || '#'}
              className={cn(
                buttonVariants({
                  variant: isActive ? 'secondary' : 'ghost',
                  size: 'icon',
                }),
                'h-9 w-9 max-sm:hover:bg-transparent',
                urlToLoad === link.href &&
                  'animate-pulse bg-accent text-accent-foreground'
              )}
              onClick={() => {
                if (
                  link.href &&
                  !link.newTab &&
                  link.href.split('?')[0] !== pathname
                )
                  setUrlToLoad(link.href.split('?')[0]);
                onClick?.();
              }}
            >
              {link.icon}
              <span className="sr-only">{link.title}</span>
            </Link>
          </TooltipTrigger>
          <TooltipContent
            side="right"
            className={cn(
              'flex items-center gap-4 border bg-background text-foreground',
              ((ENABLE_KEYBOARD_SHORTCUTS && link.shortcut) || link.trailing) &&
                'flex-col items-start gap-1'
            )}
          >
            {link.title}
            {((ENABLE_KEYBOARD_SHORTCUTS && link.shortcut) ||
              link.trailing) && (
              <span
                className={cn(
                  'text-muted-foreground',
                  (ENABLE_KEYBOARD_SHORTCUTS && link.shortcut) || link.trailing
                    ? 'rounded-lg border bg-foreground/5 px-2 py-0.5'
                    : 'ml-auto'
                )}
              >
                {ENABLE_KEYBOARD_SHORTCUTS && link.shortcut
                  ? link.shortcut
                      .replace('CTRL', '⌘')
                      .replace('SHIFT', '⇧')
                      .replace(/\+/g, '')
                  : link.trailing}
              </span>
            )}
          </TooltipContent>
        </Tooltip>
      );
    }

    return (
      <Link
        key={key}
        href={link.href || '#'}
        className={cn(
          buttonVariants({
            variant: isActive ? 'secondary' : 'ghost',
            size: 'sm',
          }),
          urlToLoad === link.href &&
            'animate-pulse bg-accent text-accent-foreground',
          'w-full justify-between gap-2 max-sm:hover:bg-transparent'
        )}
        onClick={() => {
          if (link.href && !link.newTab && link.href.split('?')[0] !== pathname)
            setUrlToLoad(link.href.split('?')[0]);
          onClick?.();
        }}
      >
        <div className="flex items-center">
          {link.icon && (
            <>
              {link.icon}
              <span className="w-2" />
            </>
          )}
          {link.title}
        </div>
        {((ENABLE_KEYBOARD_SHORTCUTS && link.shortcut) || link.trailing) && (
          <span
            className={cn(
              'text-muted-foreground',
              isActive && 'bg-background text-foreground',
              ENABLE_KEYBOARD_SHORTCUTS && link.shortcut
                ? 'hidden rounded-lg border bg-foreground/5 px-2 py-0.5 md:block'
                : 'ml-auto'
            )}
          >
            {ENABLE_KEYBOARD_SHORTCUTS && link.shortcut
              ? link.shortcut
                  .replace('CTRL', '⌘')
                  .replace('SHIFT', '⇧')
                  .replace(/\+/g, '')
              : link.trailing}
          </span>
        )}
      </Link>
    );
  }

  function renderGroupedLink(link: NavLink, groupKey: string) {
    const isActive = isLinkActive(link);
    const isOpen = openGroups.has(groupKey);
    const visibleChildren = link.children?.filter(shouldShowLink) || [];

    if (visibleChildren.length === 0) return null;

    if (isCollapsed) {
      // In collapsed mode, show children as separate items
      return visibleChildren.map((child, childIdx) =>
        renderLink(child, `${groupKey}-child-${childIdx}`)
      );
    }

    return (
      <Collapsible
        key={groupKey}
        open={isOpen}
        onOpenChange={() => toggleGroup(groupKey)}
      >
        <CollapsibleTrigger asChild>
          <button
            className={cn(
              buttonVariants({
                variant: isActive ? 'secondary' : 'ghost',
                size: 'sm',
              }),
              'w-full justify-between gap-2 max-sm:hover:bg-transparent'
            )}
          >
            <div className="flex items-center">
              {link.icon && (
                <>
                  {link.icon}
                  <span className="w-2" />
                </>
              )}
              {link.title}
            </div>
            <ChevronRight
              className={cn(
                'h-4 w-4 transition-transform',
                isOpen && 'rotate-90'
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-1 space-y-1">
          <div className="ml-6 space-y-1">
            {visibleChildren.map((child, childIdx) =>
              renderLink(child, `${groupKey}-child-${childIdx}`)
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  }

  return (
    <nav className={cn('grid gap-1 p-2', isCollapsed && 'justify-center')}>
      {links
        .map((link, idx) => {
          const key = `nav-item-${idx}`;

          if (!link) return <Separator key={key} className="my-1" />;

          if (!shouldShowLink(link)) return null;

          // Handle grouped links with children
          if (link.children) {
            return renderGroupedLink(link, `group-${idx}`);
          }

          // Handle regular links
          if (link.href) {
            return renderLink(link, key);
          }

          return null;
        })
        .filter(Boolean)
        .flat() // Flatten because grouped links can return arrays
        // filter out consecutive Separator components
        .filter((item, idx, arr) => {
          if (item?.type === Separator) {
            const nextItem = arr[idx + 1];
            if (!nextItem || nextItem?.type === Separator) return false;
          }
          return true;
        })}
    </nav>
  );
}
