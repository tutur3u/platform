'use client';

import { ChevronRight } from '@tuturuuu/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavLink as NavLinkType } from '@/components/navigation';

interface NavLinkProps {
  wsId: string;
  link: NavLinkType;
  isCollapsed: boolean;
  onSubMenuClick: (links: NavLinkType[], title: string) => void;
  onClick: () => void;
}

export function NavLink({
  link,
  isCollapsed,
  onSubMenuClick,
  onClick,
}: NavLinkProps) {
  const pathname = usePathname();
  const { title, icon, href, children, onClick: onLinkClick } = link;
  const hasChildren = children && children.length > 0;

  // Recursive function to check if any nested child matches the pathname
  const hasActiveChild = (navLinks: NavLinkType[]): boolean => {
    return navLinks.some((child) => {
      const aliasMatches = child.aliases?.some((alias) =>
        child.matchExact
          ? (pathname || '') === alias
          : (pathname || '').startsWith(alias)
      );
      const hrefMatches =
        child.href &&
        (child.matchExact
          ? (pathname || '') === child.href
          : (pathname || '').startsWith(child.href));
      const childMatches = Boolean(aliasMatches || hrefMatches);

      if (childMatches) return true;

      if (child.children) {
        return hasActiveChild(child.children);
      }

      return false;
    });
  };

  // For time tracker routes, only mark as active if it's an exact match or if it's the most specific match
  const isTimeTrackerRoute = /(^|\/)time-tracker(\/|$)/.test(pathname || '');

  // Helper function to normalize paths for comparison
  const normalize = (p: string): string[] => {
    return p
      .split('?')[0] // drop query string
      .replace(/\/+$/, '') // trim trailing slash(es)
      .split('/') // split into segments
      .filter(Boolean); // remove empty segments
  };

  let isActive = false;

  if (isTimeTrackerRoute && href && /(^|\/)time-tracker(\/|$)/.test(href)) {
    // For time tracker routes, use exact matching to avoid multiple active states
    if (link.matchExact) {
      isActive = (pathname || '') === href;
    } else {
      // For non-exact matches, only mark as active if it's the most specific match
      const safePathname = pathname || '';
      const safeHref = href || '';
      const currentPathSegments = normalize(pathname || '').length;
      const linkPathSegments = normalize(href || '').length;
      isActive =
        safePathname.startsWith(safeHref) &&
        currentPathSegments === linkPathSegments;
    }
    // Optional: if you want the parent "Time Tracker" link to highlight when any child is active
    if (!isActive && link.children && link.children.length > 0) {
      isActive = hasActiveChild(link.children);
    }
  } else {
    // Standard logic for non-time-tracker routes
    isActive = Boolean(
      (href &&
        (link.matchExact
          ? (pathname || '') === href
          : (pathname || '').startsWith(href))) ||
        (link.children && hasActiveChild(link.children))
    );
  }

  const content = (
    <>
      <div key="nav-content" className="flex items-center gap-2">
        {icon && <span key="nav-icon">{icon}</span>}
        <span
          key="nav-title"
          className={cn('truncate', isCollapsed && 'hidden')}
        >
          {title}
        </span>
      </div>
      {hasChildren && !isCollapsed && (
        <ChevronRight key="nav-chevron" className="ml-auto h-4 w-4" />
      )}
    </>
  );

  const commonProps = {
    className: cn(
      'flex cursor-pointer items-center justify-between rounded-md p-2 font-medium text-sm',
      isCollapsed && 'justify-center',
      isActive && 'bg-accent text-accent-foreground',
      link.isBack && 'mb-2 cursor-pointer',
      link.tempDisabled
        ? 'cursor-default opacity-50'
        : 'hover:bg-accent hover:text-accent-foreground'
    ),
    onClick: () => {
      if (link.tempDisabled) return;
      if (onLinkClick) {
        onLinkClick();
      } else if (hasChildren && children) {
        onSubMenuClick(children, title);
      } else if (href) {
        onClick();
      }
    },
  };

  const linkElement = href ? (
    <Link href={href} {...commonProps}>
      {content}
    </Link>
  ) : (
    <div {...commonProps}>{content}</div>
  );

  if (isCollapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{linkElement}</TooltipTrigger>
        <TooltipContent side="right">
          <span>{title}</span>
        </TooltipContent>
      </Tooltip>
    );
  }

  return linkElement;
}
