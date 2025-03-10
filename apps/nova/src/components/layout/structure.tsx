'use client';

import { Nav } from './nav';
import { Structure as BaseStructure } from '@tuturuuu/ui/custom/structure';
import { debounce } from 'lodash';
import { usePathname } from 'next/navigation';
import { ReactNode, useCallback, useState } from 'react';

interface NavItem {
  name: string;
  href: string;
  icon: React.ReactNode;
  requiresAdmin?: boolean;
  subItems?: { name: string; href: string }[];
}

interface StructureProps {
  isAdmin: boolean;
  defaultLayout?: number[];
  defaultCollapsed: boolean;
  navCollapsedSize: number;
  navItems: NavItem[];
  actions: ReactNode;
  userPopover: ReactNode;
  children: ReactNode;
}

export default function Structure({
  isAdmin,
  defaultLayout = [20, 80],
  defaultCollapsed = false,
  navCollapsedSize,
  navItems,
  actions,
  userPopover,
  children,
}: StructureProps) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  // Add debounced function for saving sidebar sizes
  const debouncedSaveSizes = useCallback(
    debounce(async (sizes: { sidebar: number; main: number }) => {
      await fetch('/api/v1/infrastructure/sidebar/sizes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sizes),
      });
    }, 500),
    []
  );

  // Add debounced function for saving sidebar collapsed state
  const debouncedSaveCollapsed = useCallback(
    debounce(async (collapsed: boolean) => {
      await fetch('/api/v1/infrastructure/sidebar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ collapsed }),
      });
    }, 500),
    []
  );

  // Find current page title based on pathname
  const currentPage = navItems.find(
    (item) =>
      pathname === item.href ||
      pathname.startsWith(item.href + '/') ||
      item.subItems?.some((subItem) => pathname === subItem.href)
  );
  const pageTitle = currentPage?.name || '';

  const sidebarHeader = (
    <span className="text-lg font-semibold">{pageTitle}</span>
  );

  const sidebarContent = (
    <Nav
      isAdmin={isAdmin}
      isCollapsed={isCollapsed}
      navItems={navItems}
      onClick={() => window.innerWidth < 768 && setIsCollapsed(true)}
    />
  );

  const mobileHeader = <span className="font-semibold">Menu</span>;

  return (
    <BaseStructure
      defaultLayout={defaultLayout}
      navCollapsedSize={navCollapsedSize}
      isCollapsed={isCollapsed}
      setIsCollapsed={setIsCollapsed}
      debouncedSaveSizes={debouncedSaveSizes}
      debouncedSaveCollapsed={debouncedSaveCollapsed}
      mobileHeader={mobileHeader}
      sidebarHeader={sidebarHeader}
      sidebarContent={sidebarContent}
      actions={actions}
      userPopover={userPopover}
      children={children}
    />
  );
}
