'use client';

import { Boxes } from '@tuturuuu/icons';
import { AppsLauncherDialog } from '@tuturuuu/satellite';
import { Button } from '@tuturuuu/ui/button';
import { LogoTitle } from '@tuturuuu/ui/custom/logo-title';
import { SidebarFooterActions } from '@tuturuuu/ui/custom/sidebar-footer-actions';
import { Structure as BaseStructure } from '@tuturuuu/ui/custom/structure';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
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
  const [appsLauncherOpen, setAppsLauncherOpen] = useState(false);
  const t = useTranslations('command_launcher');

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
