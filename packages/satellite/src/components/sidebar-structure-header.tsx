'use client';

import { TuturuuLogo } from '@tuturuuu/ui/custom/tuturuuu-logo';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { type AppBrandId, FixedAppBrand } from './fixed-app-brand';

interface SidebarStructureMobileHeaderProps {
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
  launcherLabel,
  onOpenApps,
}: SidebarStructureMobileHeaderProps) {
  return (
    <FixedAppBrand
      appHref={appHref}
      appId={appId}
      centralHref={brandHref}
      launcherLabel={launcherLabel}
      onAppClick={onOpenApps}
    />
  );
}

interface SidebarStructureHeaderProps {
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
  isCollapsed,
  launcherLabel,
  onOpenApps,
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
      actions={actions}
      appHref={appHref}
      appId={appId}
      centralHref={brandHref}
      launcherLabel={launcherLabel}
      onAppClick={onOpenApps}
    />
  );
}
