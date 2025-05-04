'use client';

import { Nav } from './nav';
import { LogoTitle } from '@tuturuuu/ui/custom/logo-title';
import { Structure as BaseStructure } from '@tuturuuu/ui/custom/structure';
import { cn } from '@tuturuuu/utils/format';
import { debounce } from 'lodash';
import Image from 'next/image';
import Link from 'next/link';
import { ReactNode, useCallback, useEffect, useState } from 'react';

interface NavItem {
  name: string;
  href: string;
  icon: React.ReactNode;
  requiresAdmin?: boolean;
  subItems?: { name: string; href: string }[];
}

interface StructureProps {
  allowChallengeManagement: boolean;
  allowRoleManagement: boolean;
  defaultLayout?: number[];
  defaultCollapsed: boolean;
  navCollapsedSize: number;
  navItems: NavItem[];
  actions: ReactNode;
  userPopover: ReactNode;
  children: ReactNode;
}

export default function Structure({
  allowChallengeManagement,
  allowRoleManagement,
  defaultLayout = [20, 80],
  defaultCollapsed = false,
  navCollapsedSize,
  navItems,
  actions,
  userPopover,
  children,
}: StructureProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  useEffect(() => {
    setIsCollapsed(window.innerWidth < 768);
  }, []);

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

  const sidebarHeader = (
    <Link href="/" className="flex w-full items-center gap-2">
      <div
        className={cn(
          isCollapsed
            ? 'flex w-full items-center justify-center'
            : 'inline-block w-fit',
          'flex-none'
        )}
      >
        <Image
          src="/media/logos/nova-transparent.png"
          className="h-8 w-8"
          width={32}
          height={32}
          alt="logo"
        />
      </div>
      {isCollapsed || <LogoTitle text="Nova" />}
    </Link>
  );

  const sidebarContent = (
    <Nav
      allowChallengeManagement={allowChallengeManagement}
      allowRoleManagement={allowRoleManagement}
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
