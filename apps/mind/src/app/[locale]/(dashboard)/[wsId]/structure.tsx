'use client';

import { LogoTitle } from '@tuturuuu/ui/custom/logo-title';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { SidebarFooterActions } from '@tuturuuu/ui/custom/sidebar-footer-actions';
import { Structure as BaseStructure } from '@tuturuuu/ui/custom/structure';
import { TuturuuLogo } from '@tuturuuu/ui/custom/tuturuuu-logo';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { TTR_URL } from '@/constants/common';
import { useSidebar } from '@/context/sidebar-context';
import { MindSidebarBoards } from './mind-sidebar-boards';
import { Nav } from './nav';
import { filterLinks, findActiveLink } from './structure-utils';
import { WorkspaceSelect } from './workspace-select';

type StructureProps = {
  actions: ReactNode;
  children: ReactNode;
  defaultCollapsed: boolean;
  links: (NavLink | null)[];
  userPopover: ReactNode;
  workspace: { tier?: string | null } | null;
  workspaceSlug: string;
  wsId: string;
};

export function Structure({
  actions,
  children,
  defaultCollapsed,
  links,
  userPopover,
  workspace,
  workspaceSlug,
  wsId,
}: StructureProps) {
  const pathname = usePathname();
  const { behavior, handleBehaviorChange } = useSidebar();
  const [initialized, setInitialized] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const filteredLinks = useMemo(() => filterLinks(links), [links]);
  const currentLink = useMemo(
    () => findActiveLink(filteredLinks, pathname),
    [filteredLinks, pathname]
  );

  useEffect(() => setInitialized(true), []);
  useEffect(() => {
    setIsCollapsed(behavior === 'collapsed' || behavior === 'hover');
  }, [behavior]);

  const toggle = () => {
    const nextCollapsed = !isCollapsed;
    setIsCollapsed(nextCollapsed);
    handleBehaviorChange(nextCollapsed ? 'collapsed' : 'expanded');
  };

  const hasOpenDialogs = useCallback(
    () =>
      document.querySelector('[data-state="open"][role="dialog"]') !== null ||
      document.querySelector('[data-state="open"][role="alertdialog"]') !==
        null,
    []
  );
  const isHoverMode = behavior === 'hover';
  const onMouseEnter = isHoverMode
    ? () => {
        if (!hasOpenDialogs()) setIsCollapsed(false);
      }
    : undefined;
  const onMouseLeave = isHoverMode
    ? () => {
        if (!hasOpenDialogs()) setIsCollapsed(true);
      }
    : undefined;

  if (!initialized) return null;

  return (
    <BaseStructure
      actions={actions}
      feedbackButton={
        <SidebarFooterActions
          isCollapsed={isCollapsed}
          showUpgrade={!workspace?.tier || workspace.tier === 'FREE'}
          upgradeExternal
          upgradeHref={`${TTR_URL}/${wsId}/billing`}
          wsId={wsId}
        />
      }
      header={null}
      hideSizeToggle={behavior === 'hover'}
      isCollapsed={isCollapsed}
      mobileHeader={
        <>
          <Link className="flex flex-none items-center gap-2" href="/">
            <TuturuuLogo
              className="h-8 w-8"
              height={32}
              width={32}
              alt="logo"
            />
          </Link>
          <div className="mx-2 h-4 w-px flex-none rotate-30 bg-foreground/20" />
          <div className="flex min-w-0 items-center gap-2 font-semibold text-lg">
            {currentLink?.icon ? (
              <div className="flex-none">{currentLink.icon}</div>
            ) : null}
            <span className="line-clamp-1">{currentLink?.title}</span>
          </div>
        </>
      }
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      overlayOnExpand={behavior === 'hover'}
      setIsCollapsed={toggle}
      sidebarContent={
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="scrollbar-none overflow-y-auto border-border border-b py-1">
            <Nav
              isCollapsed={isCollapsed}
              links={filteredLinks}
              onClick={() => {
                if (window.innerWidth < 768) setIsCollapsed(true);
              }}
              onSubMenuClick={() => null}
              wsId={wsId}
            />
          </div>
          {isCollapsed ? null : (
            <MindSidebarBoards workspaceSlug={workspaceSlug} wsId={wsId} />
          )}
        </div>
      }
      sidebarHeader={
        <>
          {isCollapsed || wsId === ROOT_WORKSPACE_ID || (
            <Link className="flex flex-none items-center gap-2" href="/">
              <TuturuuLogo
                className="h-6 w-6"
                height={32}
                width={32}
                alt="logo"
              />
              <LogoTitle />
            </Link>
          )}
          <Suspense
            fallback={
              <div className="h-10 w-full animate-pulse rounded-lg bg-foreground/5" />
            }
          >
            <WorkspaceSelect hideLeading={isCollapsed} wsId={wsId} />
          </Suspense>
        </>
      }
      userPopover={userPopover}
    >
      {children}
    </BaseStructure>
  );
}
