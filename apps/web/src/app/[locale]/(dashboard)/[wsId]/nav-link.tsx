'use client';

import { NavLink as NavLinkType } from '@/components/navigation';
import { ChevronRight } from '@tuturuuu/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavLinkProps {
  wsId: string;
  link: NavLinkType;
  isCollapsed: boolean;
  // eslint-disable-next-line no-unused-vars
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

  const isActive =
    href && (link.matchExact ? pathname === href : pathname.startsWith(href));

  const content = (
    <>
      <div className="flex items-center gap-2">
        {icon}
        <span className={cn('truncate', isCollapsed && 'hidden')}>{title}</span>
      </div>
      {hasChildren && !isCollapsed && (
        <ChevronRight className="ml-auto h-4 w-4" />
      )}
    </>
  );

  const commonProps = {
    className: cn(
      'flex cursor-pointer items-center justify-between rounded-md p-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground',
      isCollapsed && 'justify-center',
      isActive && 'bg-accent text-accent-foreground',
      link.isBack && 'mb-2 cursor-pointer'
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
