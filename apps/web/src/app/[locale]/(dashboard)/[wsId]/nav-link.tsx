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

  // Helper function to normalize paths for comparison
  const normalize = (p: string): string[] => {
    const queryRemoved = p.split('?')[0] || p;
    const trimmed = queryRemoved.replace(/\/+$/, '');
    const segments = trimmed.split('/');
    return segments.filter(Boolean);
  };

  // Universal logic for nested navigation routes - prevents multiple active states
  const isActive = (() => {
    if (link.matchExact) {
      return (pathname || '') === href;
    }

    if (href) {
      const safePathname = pathname || '';
      const safeHref = href || '';

      // Check if this is a nested route (has multiple path segments)
      const currentPathSegments = normalize(safePathname).length;
      const linkPathSegments = normalize(safeHref).length;

      if (currentPathSegments > linkPathSegments) {
        // For nested routes, only mark as active if it's the most specific match
        // This prevents parent routes from being active when child routes are active
        return (
          safePathname.startsWith(safeHref) &&
          currentPathSegments === linkPathSegments
        );
      } else {
        // For same-level or parent routes, use standard startsWith logic
        return safePathname.startsWith(safeHref);
      }
    }

    // Check if any children are active
    if (link.children && link.children.length > 0) {
      return hasActiveChild(link.children);
    }

    return false;
  })();

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
