'use client';

import { AppsLauncherDialog } from '@tuturuuu/satellite';
import { FixedAppBrand } from '@tuturuuu/satellite/fixed-app-brand';
import { SidebarFooterActions } from '@tuturuuu/ui/custom/sidebar-footer-actions';
import { Structure as BaseStructure } from '@tuturuuu/ui/custom/structure';
import { TuturuuLogo } from '@tuturuuu/ui/custom/tuturuuu-logo';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { TTR_URL } from '@/constants/common';
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
  const [appsLauncherOpen, setAppsLauncherOpen] = useState(false);
  const t = useTranslations('command_launcher');

  const sidebarHeader = isCollapsed ? (
    <Link aria-label="Tuturuuu" href={TTR_URL}>
      <TuturuuLogo alt="" className="size-8" height={32} width={32} />
    </Link>
  ) : (
    <FixedAppBrand
      appHref="/"
      appName="Nova"
      centralHref={TTR_URL}
      launcherLabel={t('apps')}
      onAppClick={() => setAppsLauncherOpen(true)}
    />
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
    <FixedAppBrand
      appHref="/"
      appName="Nova"
      centralHref={TTR_URL}
      launcherLabel={t('apps')}
      onAppClick={() => setAppsLauncherOpen(true)}
    />
  );

  return (
    <>
      <AppsLauncherDialog
        currentWorkspace={null}
        onOpenChange={setAppsLauncherOpen}
        open={appsLauncherOpen}
      />
      <BaseStructure
        actions={actions}
        feedbackButton={
          <SidebarFooterActions
            isCollapsed={isCollapsed}
            showUpgrade={false}
            wsId=""
          />
        }
        isCollapsed={isCollapsed}
        mobileHeader={mobileHeader}
        setIsCollapsed={setIsCollapsed}
        sidebarContent={sidebarContent}
        sidebarHeader={sidebarHeader}
        userPopover={userPopover}
      >
        {children}
      </BaseStructure>
    </>
  );
}
