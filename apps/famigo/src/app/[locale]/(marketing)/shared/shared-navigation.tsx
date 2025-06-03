'use client';

import { MainNavigationMenu } from '../navigation-menu';
import { NavItem } from './navigation-config';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface NavigationProps {
  /**
   * Optional custom className for the container
   */
  className?: string;

  /**
   * Whether to display as mobile navigation (accordion style)
   */
  mobile?: boolean;

  /**
   * Callback to trigger when a link is clicked (useful for closing mobile menu)
   */
  onLinkClick?: () => void;
}

/**
 * Reusable link component that can be used in both desktop and mobile navigation
 */
export const NavigationLink = ({
  item,
  onClick,
  className,
}: {
  item: NavItem;
  onClick?: () => void;
  className?: string;
}) => {
  const pathname = usePathname();
  const isActive = pathname === item.href;

  return (
    <Link
      href={item.href}
      className={cn(
        'transition-opacity duration-200',
        isActive ? 'opacity-100' : 'opacity-50 hover:opacity-100',
        className
      )}
      onClick={onClick}
      {...(item.external && { target: '_blank', rel: 'noopener noreferrer' })}
    >
      <span className="flex items-center gap-2">
        {item.icon}
        {item.label}
        {item.badge && (
          <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs">
            {item.badge}
          </span>
        )}
      </span>
    </Link>
  );
};

/**
 * Shared navigation component that can render in mobile or desktop mode
 * Mobile mode renders links directly, while desktop mode uses MainNavigationMenu
 */
export const SharedNavigation = ({
  className,
  mobile = false,
}: NavigationProps) => {
  // Only render the desktop navigation menu if not in mobile mode
  if (!mobile) {
    return <MainNavigationMenu />;
  }

  // For mobile navigation, we show simple links
  return (
    <div className={cn('flex flex-col space-y-2', className)}>
      {/* Mobile navigation links handled by the Menu component */}
    </div>
  );
};
