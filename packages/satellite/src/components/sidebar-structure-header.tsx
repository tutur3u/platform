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
  showDivider?: boolean;
}

export function SidebarStructureMobileHeader({
  brandHref,
  currentIcon,
  currentTitle,
  mobileBrand,
  showDivider = true,
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
      {showDivider && currentTitle ? (
        <div className="mx-2 h-4 w-px flex-none rotate-30 bg-foreground/20" />
      ) : null}
      {currentTitle ? (
        <div className="flex items-center gap-2 break-all font-semibold text-lg">
          {currentIcon ? <div className="flex-none">{currentIcon}</div> : null}
          <span className="line-clamp-1">{currentTitle}</span>
        </div>
      ) : null}
    </>
  );
}

interface SidebarStructureHeaderProps {
  brand?: ReactNode;
  brandHref: string;
  collapsedBrand?: ReactNode;
  isCollapsed: boolean;
  linkBrand?: boolean;
  showBrandOnRoot?: boolean;
  stackWorkspaceSelect?: boolean;
  workspaceSelect: WorkspaceSelectRenderer;
  wsId: string;
}

export function SidebarStructureHeader({
  brand,
  brandHref,
  collapsedBrand,
  isCollapsed,
  linkBrand = true,
  showBrandOnRoot = false,
  stackWorkspaceSelect = false,
  workspaceSelect,
  wsId,
}: SidebarStructureHeaderProps) {
  const t = useTranslations();
  const brandContent = brand ?? (
    <>
      <TuturuuLogo alt="" className="h-6 w-6" height={32} width={32} />
      <LogoTitle />
    </>
  );

  if (isCollapsed) {
    return (
      <Link
        aria-label={t('common.home')}
        className="flex flex-none items-center justify-center"
        href={brandHref}
      >
        {collapsedBrand ?? (
          <TuturuuLogo alt="" className="h-7 w-7" height={32} width={32} />
        )}
      </Link>
    );
  }

  const brandNode =
    wsId === ROOT_WORKSPACE_ID && !showBrandOnRoot ? null : linkBrand ? (
      <Link
        aria-label={t('common.home')}
        className="flex min-w-0 flex-none items-center gap-2"
        href={brandHref}
      >
        {brandContent}
      </Link>
    ) : (
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {brandContent}
      </div>
    );

  if (stackWorkspaceSelect) {
    return (
      <div className="flex min-w-0 flex-1 flex-col gap-2 py-1">
        {brandNode}
        <Suspense
          fallback={
            <div className="h-10 w-full animate-pulse rounded-lg bg-foreground/5" />
          }
        >
          {workspaceSelect({ isCollapsed })}
        </Suspense>
      </div>
    );
  }

  return (
    <>
      {brandNode}
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
