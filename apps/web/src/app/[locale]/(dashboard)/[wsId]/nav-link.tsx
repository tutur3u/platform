'use client';

import type { NavLink as NavLinkType } from '@/components/navigation';
import { ChevronRight } from '@tuturuuu/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

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
      const childMatches =
        child.href &&
        (child.matchExact
          ? pathname === child.href
          : pathname.startsWith(child.href));

      if (childMatches) return true;

      if (child.children) {
        return hasActiveChild(child.children);
      }

      return false;
    });
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
      </div>
      {hasChildren && !isCollapsed && (
        <ChevronRight key="nav-chevron" className="ml-auto h-4 w-4" />
      )}
    </>
  );

  const commonProps = {
    className: cn(
      'flex cursor-pointer items-center justify-between rounded-md p-2 text-sm font-medium',
      isCollapsed && 'justify-center',
      isActive && 'bg-accent text-accent-foreground',
      link.isBack && 'mb-2 cursor-pointer',
      link.tempDisabled
        ? 'cursor-default opacity-50'
        : 'hover:bg-accent hover:text-accent-foreground'
    ),
    onClick: () => {
      if (onLinkClick) {
        onLinkClick();
      } else if (hasChildren) {
        onSubMenuClick(children!, title);
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
