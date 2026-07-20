'use client';

import { TuturuuLogo } from '@tuturuuu/ui/custom/tuturuuu-logo';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import {
  type AppBrandId,
  FixedAppBrand,
  WorkspaceSelectVisibilityToggle,
} from './fixed-app-brand';

interface WorkspaceSelectControlProps {
  hideWorkspaceSelectLabel: string;
  onToggleWorkspaceSelect?: () => void;
  showWorkspaceSelectLabel: string;
  workspaceSelectVisible: boolean;
}

function getBrandActions(
  actions: ReactNode,
  {
    hideWorkspaceSelectLabel,
    onToggleWorkspaceSelect,
    showWorkspaceSelectLabel,
    workspaceSelectVisible,
  }: WorkspaceSelectControlProps
) {
  if (!onToggleWorkspaceSelect) return actions;

  return (
    <div className="flex items-center gap-1">
      {actions}
      <WorkspaceSelectVisibilityToggle
        hideLabel={hideWorkspaceSelectLabel}
        onToggle={onToggleWorkspaceSelect}
        showLabel={showWorkspaceSelectLabel}
        visible={workspaceSelectVisible}
      />
    </div>
  );
}

interface SidebarStructureMobileHeaderProps
  extends WorkspaceSelectControlProps {
  appHref: string;
  appId: AppBrandId;
  brandHref: string;
  launcherLabel: string;
  onOpenApps: () => void;
}

export function SidebarStructureMobileHeader({
  appHref,
  appId,
  brandHref,
  hideWorkspaceSelectLabel,
  launcherLabel,
  onToggleWorkspaceSelect,
  onOpenApps,
  showWorkspaceSelectLabel,
  workspaceSelectVisible,
}: SidebarStructureMobileHeaderProps) {
  return (
    <FixedAppBrand
      actions={getBrandActions(null, {
        hideWorkspaceSelectLabel,
        onToggleWorkspaceSelect,
        showWorkspaceSelectLabel,
        workspaceSelectVisible,
      })}
      appHref={appHref}
      appId={appId}
      centralHref={brandHref}
      launcherLabel={launcherLabel}
      onAppClick={onOpenApps}
    />
  );
}

interface SidebarStructureHeaderProps extends WorkspaceSelectControlProps {
  actions?: ReactNode;
  appHref: string;
  appId: AppBrandId;
  brandHref: string;
  isCollapsed: boolean;
  launcherLabel: string;
  onOpenApps: () => void;
}

export function SidebarStructureHeader({
  actions,
  appHref,
  appId,
  brandHref,
  hideWorkspaceSelectLabel,
  isCollapsed,
  launcherLabel,
  onToggleWorkspaceSelect,
  onOpenApps,
  showWorkspaceSelectLabel,
  workspaceSelectVisible,
}: SidebarStructureHeaderProps) {
  const t = useTranslations();

  if (isCollapsed) {
    return (
      <Link
        aria-label={t('common.home')}
        className="flex flex-none items-center justify-center"
        href={brandHref}
      >
        <TuturuuLogo alt="" className="h-7 w-7" height={32} width={32} />
      </Link>
    );
  }

  return (
    <FixedAppBrand
      actions={getBrandActions(actions, {
        hideWorkspaceSelectLabel,
        onToggleWorkspaceSelect,
        showWorkspaceSelectLabel,
        workspaceSelectVisible,
      })}
      appHref={appHref}
      appId={appId}
      centralHref={brandHref}
      launcherLabel={launcherLabel}
      onAppClick={onOpenApps}
    />
  );
}
