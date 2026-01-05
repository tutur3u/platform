'use client';

import { ChevronRight } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavLink as NavLinkType } from '@/components/navigation';

interface NavLinkProps {
  wsId: string;
  link: NavLinkType;
  isCollapsed: boolean;
  onSubMenuClick: (links: (NavLinkType | null)[], title: string) => void;
  onClick: () => void;
}

export function NavLink({
  link,
  isCollapsed,
  onSubMenuClick,
  onClick,
}: NavLinkProps) {
  const pathname = usePathname();
  const { title, icon, href, children, newTab, onClick: onLinkClick } = link;
  const hasChildren = children && children.length > 0;

  // Recursive function to check if any nested child matches the pathname
  const hasActiveChild = (navLinks: (NavLinkType | null)[]): boolean => {
    return (
      navLinks?.some((child) => {
        const childMatches =
          child?.href &&
          (child.matchExact
            ? pathname === child.href
            : pathname.startsWith(child.href));

        if (childMatches) return true;

        if (child?.children) {
          return hasActiveChild(child.children);
        }

        return false;
      }) ?? false
    );
  };

  const isActive =
    (href &&
      (link.matchExact ? pathname === href : pathname.startsWith(href))) ||
    (children && hasActiveChild(children));

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
        {!isCollapsed && link.requiredWorkspaceTier && (
          <Badge
            variant="outline"
            className={cn(
              'ml-auto h-4 shrink-0 px-1 py-0 font-medium text-[10px]',
              link.requiredWorkspaceTier.requiredTier === 'PLUS' &&
                'border-dynamic-blue/50 bg-dynamic-blue/10 text-dynamic-blue',
              link.requiredWorkspaceTier.requiredTier === 'PRO' &&
                'border-dynamic-purple/50 bg-dynamic-purple/10 text-dynamic-purple',
              link.requiredWorkspaceTier.requiredTier === 'ENTERPRISE' &&
                'border-dynamic-amber/50 bg-dynamic-amber/10 text-dynamic-amber'
            )}
          >
            {link.requiredWorkspaceTier.requiredTier}
          </Badge>
        )}
      </div>
      {hasChildren && !isCollapsed && (
        <ChevronRight
          key="nav-chevron"
          className="ml-auto h-4 w-4 opacity-0 group-hover/navlink:opacity-100"
        />
      )}
    </>
  );

  const isDisabled = link.disabled || link.tempDisabled;
  const commonProps = {
    className: cn(
      'group/navlink flex cursor-pointer items-center justify-between rounded-md p-2 font-medium text-sm',
      isCollapsed && 'justify-center',
      isActive && 'bg-accent text-accent-foreground',
      link.isBack && 'mb-2 cursor-pointer',
      isDisabled
        ? 'cursor-not-allowed opacity-50'
        : 'hover:bg-accent hover:text-accent-foreground'
    ),
    onClick: () => {
      if (isDisabled) return;
      if (onLinkClick) {
        onLinkClick();
      } else if (hasChildren) {
        onSubMenuClick(children, title);
      } else if (href) {
        onClick();
      }
    },
  };

  const linkElement =
    href && !isDisabled ? (
      <Link href={href} {...commonProps} target={newTab ? '_blank' : '_self'}>
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
