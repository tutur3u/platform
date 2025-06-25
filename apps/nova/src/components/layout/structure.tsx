'use client';

import { LogoTitle } from '@tuturuuu/ui/custom/logo-title';
import { Structure as BaseStructure } from '@tuturuuu/ui/custom/structure';
import { cn } from '@tuturuuu/utils/format';
import Image from 'next/image';
import Link from 'next/link';
import { type ReactNode, useState } from 'react';
import { Nav } from './nav';

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
  defaultCollapsed?: boolean;
  navItems: NavItem[];
  actions: ReactNode;
  userPopover: ReactNode;
  children: ReactNode;
}

export default function Structure({
  allowChallengeManagement,
  allowRoleManagement,
  defaultCollapsed = false,
  navItems,
  actions,
  userPopover,
  children,
}: StructureProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

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

  const mobileHeader = (
    <Link href="/" className="flex w-fit items-center gap-2">
      <div
        className={cn(
          isCollapsed
            ? 'flex w-fit items-center justify-center'
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
      <LogoTitle text="Nova" />
    </Link>
  );

  return (
    <BaseStructure
      isCollapsed={isCollapsed}
      setIsCollapsed={setIsCollapsed}
      mobileHeader={mobileHeader}
      sidebarHeader={sidebarHeader}
      sidebarContent={sidebarContent}
      actions={actions}
      userPopover={userPopover}
    >
      {children}
    </BaseStructure>
  );
}
