'use client';

import { LogoTitle } from '@tuturuuu/ui/custom/logo-title';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { TuturuuLogo } from '@tuturuuu/ui/custom/tuturuuu-logo';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { type Dispatch, type SetStateAction, Suspense } from 'react';
import { Nav } from './nav';
import type { StructureNavigationState } from './use-structure-navigation';
import { WorkspaceSelect } from './workspace-select';

interface StructurePanelsProps {
  backButton: NavLink;
  currentLink?: NavLink;
  currentTitle?: string;
  filteredCurrentLinks: (NavLink | null)[];
  handleNavChange: (newLinks: (NavLink | null)[], parentTitle: string) => void;
  isCollapsed: boolean;
  navState: StructureNavigationState;
  setIsCollapsed: Dispatch<SetStateAction<boolean>>;
  wsId: string;
}

export function getStructurePanels({
  backButton,
  currentLink,
  currentTitle,
  filteredCurrentLinks,
  handleNavChange,
  isCollapsed,
  navState,
  setIsCollapsed,
  wsId,
}: StructurePanelsProps) {
  const closeOnMobile = () => {
    if (window.innerWidth < 768) {
      setIsCollapsed(true);
    }
  };

  const sidebarHeader = (
    <>
      {isCollapsed || wsId === ROOT_WORKSPACE_ID || (
        <Link href="/" className="flex flex-none items-center gap-2">
          <div className="flex-none">
            <TuturuuLogo
              className="h-6 w-6"
              width={32}
              height={32}
              alt="logo"
            />
          </div>
          <LogoTitle />
        </Link>
      )}

      <Suspense
        fallback={
          <div className="h-10 w-full animate-pulse rounded-lg bg-foreground/5" />
        }
      >
        <WorkspaceSelect wsId={wsId} hideLeading={isCollapsed} />
      </Suspense>
    </>
  );

  const sidebarContent = (
    <div className="relative h-full overflow-hidden">
      <div
        key={navState.history.length}
        className={cn(
          'absolute flex h-full min-h-0 w-full flex-col transition-transform duration-300 ease-in-out',
          navState.direction === 'forward'
            ? 'slide-in-from-right animate-in'
            : 'slide-in-from-left animate-in'
        )}
      >
        {navState.history.length === 0 ? (
          <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto">
            <Nav
              key="root"
              wsId={wsId}
              isCollapsed={isCollapsed}
              links={filteredCurrentLinks}
              onSubMenuClick={handleNavChange}
              onClick={closeOnMobile}
            />
          </div>
        ) : (
          <>
            <Nav
              key="back"
              wsId={wsId}
              isCollapsed={isCollapsed}
              links={[backButton]}
              onSubMenuClick={handleNavChange}
              onClick={() => {
                // Back button keeps the current sidebar level visible.
              }}
            />
            {!isCollapsed && currentTitle && (
              <div className="p-2 pt-0">
                <h2 className="line-clamp-1 px-2 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
                  {currentTitle}
                </h2>
              </div>
            )}
            {!isCollapsed && <div className="mx-4 my-1 border-b" />}
            {filteredCurrentLinks.length > 0 && (
              <div className="scrollbar-none flex-1 overflow-y-auto">
                <Nav
                  key="nav"
                  wsId={wsId}
                  isCollapsed={isCollapsed}
                  links={filteredCurrentLinks}
                  onSubMenuClick={handleNavChange}
                  onClick={closeOnMobile}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  const mobileHeader = (
    <>
      <div className="flex flex-none items-center gap-2">
        <Link href="/" className="flex flex-none items-center gap-2">
          <TuturuuLogo className="h-8 w-8" width={32} height={32} alt="logo" />
        </Link>
      </div>
      <div className="mx-2 h-4 w-px flex-none rotate-30 bg-foreground/20" />
      <div className="flex items-center gap-2 break-all font-semibold text-lg">
        {currentLink?.icon && (
          <div className="flex-none">{currentLink.icon}</div>
        )}
        <span className="line-clamp-1">{currentLink?.title}</span>
      </div>
    </>
  );

  return { mobileHeader, sidebarContent, sidebarHeader };
}
