'use client';

import { LogoTitle } from '@tuturuuu/ui/custom/logo-title';
import { TuturuuLogo } from '@tuturuuu/ui/custom/tuturuuu-logo';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type ReactNode, Suspense } from 'react';
import type { WorkspaceSelectRenderer } from './sidebar-structure-utils';

interface SidebarStructureMobileHeaderProps {
  brandHref: string;
  currentIcon?: ReactNode;
  currentTitle?: string;
  mobileBrand?: ReactNode;
}

export function SidebarStructureMobileHeader({
  brandHref,
  currentIcon,
  currentTitle,
  mobileBrand,
}: SidebarStructureMobileHeaderProps) {
  const t = useTranslations();

  return (
    <>
      {mobileBrand ?? (
        <Link
          aria-label={t('common.home')}
          className="flex flex-none items-center gap-2"
          href={brandHref}
        >
          <TuturuuLogo alt="" className="h-8 w-8" height={32} width={32} />
        </Link>
      )}
      <div className="mx-2 h-4 w-px flex-none rotate-30 bg-foreground/20" />
      <div className="flex items-center gap-2 break-all font-semibold text-lg">
        {currentIcon ? <div className="flex-none">{currentIcon}</div> : null}
        <span className="line-clamp-1">{currentTitle}</span>
      </div>
    </>
  );
}

interface SidebarStructureHeaderProps {
  brand?: ReactNode;
  brandHref: string;
  isCollapsed: boolean;
  workspaceSelect: WorkspaceSelectRenderer;
  wsId: string;
}

export function SidebarStructureHeader({
  brand,
  brandHref,
  isCollapsed,
  workspaceSelect,
  wsId,
}: SidebarStructureHeaderProps) {
  const t = useTranslations();

  return (
    <>
      {isCollapsed || wsId === ROOT_WORKSPACE_ID ? null : (
        <Link
          aria-label={t('common.home')}
          className="flex flex-none items-center gap-2"
          href={brandHref}
        >
          {brand ?? (
            <>
              <TuturuuLogo alt="" className="h-6 w-6" height={32} width={32} />
              <LogoTitle />
            </>
          )}
        </Link>
      )}
      <Suspense
        fallback={
          <div className="h-10 w-full animate-pulse rounded-lg bg-foreground/5" />
        }
      >
        {workspaceSelect({ isCollapsed })}
      </Suspense>
    </>
  );
}
