'use client';

import { Boxes } from '@tuturuuu/icons';
import { AppsLauncherDialog } from '@tuturuuu/satellite';
import { FixedAppBrand } from '@tuturuuu/satellite/fixed-app-brand';
import { Button } from '@tuturuuu/ui/button';
import { SidebarFooterActions } from '@tuturuuu/ui/custom/sidebar-footer-actions';
import { Structure as BaseStructure } from '@tuturuuu/ui/custom/structure';
import { TuturuuLogo } from '@tuturuuu/ui/custom/tuturuuu-logo';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
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
    <TuturuuLogo alt="" className="size-8" height={32} width={32} />
  ) : (
    <FixedAppBrand appHref="/" appName="Nova" centralHref={TTR_URL} />
  );

  const appsLauncherButton = isCollapsed ? (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <Button
          className="h-9 w-9"
          onClick={() => setAppsLauncherOpen(true)}
          type="button"
          variant="ghost"
        >
          <Boxes className="h-4 w-4" />
          <span className="sr-only">{t('apps')}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent
        className="flex items-center gap-4 border bg-background text-foreground"
        side="right"
      >
        {t('apps')}
      </TooltipContent>
    </Tooltip>
  ) : (
    <Button
      className="w-full justify-start gap-2"
      onClick={() => setAppsLauncherOpen(true)}
      type="button"
      variant="ghost"
    >
      <Boxes className="h-4 w-4" />
      {t('apps')}
    </Button>
  );

  const sidebarContent = (
    <>
      <div className={cn('px-2 pt-2', isCollapsed && 'flex justify-center')}>
        {appsLauncherButton}
      </div>
      <Nav
        allowChallengeManagement={allowChallengeManagement}
        allowRoleManagement={allowRoleManagement}
        isCollapsed={isCollapsed}
        navItems={navItems}
        onClick={() => window.innerWidth < 768 && setIsCollapsed(true)}
      />
    </>
  );

  const mobileHeader = (
    <FixedAppBrand appHref="/" appName="Nova" centralHref={TTR_URL} />
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
