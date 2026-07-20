'use client';

import { Nav } from '@tuturuuu/ui/custom/nav';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { cn } from '@tuturuuu/utils/format';
import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  Suspense,
} from 'react';
import type {
  NavigationState,
  WorkspaceSelectRenderer,
} from './sidebar-structure-utils';

interface SidebarStructureContentProps {
  backButton: NavLink;
  currentTitle?: string;
  extraContent?: ReactNode;
  filteredCurrentLinks: (NavLink | null)[];
  isCollapsed: boolean;
  navState: NavigationState;
  setIsCollapsed: Dispatch<SetStateAction<boolean>>;
  setNavState: Dispatch<SetStateAction<NavigationState>>;
  workspaceSelect?: WorkspaceSelectRenderer;
  workspaceSelectVisible: boolean;
  wsId: string;
}

export function SidebarStructureContent({
  backButton,
  currentTitle,
  extraContent,
  filteredCurrentLinks,
  isCollapsed,
  navState,
  setIsCollapsed,
  setNavState,
  workspaceSelect,
  workspaceSelectVisible,
  wsId,
}: SidebarStructureContentProps) {
  const handleSubMenuClick = (
    newLinks: (NavLink | null)[],
    parentTitle: string
  ) => {
    setNavState((prevState) => ({
      currentLinks: newLinks,
      direction: 'forward',
      history: [...prevState.history, prevState.currentLinks],
      titleHistory: [...prevState.titleHistory, parentTitle],
    }));
  };

  const closeOnMobile = () => {
    if (window.innerWidth < 768) setIsCollapsed(true);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {workspaceSelect ? (
        <div
          aria-hidden={!workspaceSelectVisible}
          className={cn(
            'grid shrink-0 overflow-hidden px-2 transition-[grid-template-rows,opacity,border-color,padding] duration-200 ease-out',
            workspaceSelectVisible
              ? 'grid-rows-[1fr] border-b pb-2 opacity-100'
              : 'pointer-events-none grid-rows-[0fr] border-transparent pb-0 opacity-0'
          )}
          data-sidebar-workspace-select
          data-state={workspaceSelectVisible ? 'open' : 'closed'}
          id="sidebar-workspace-selector"
          inert={workspaceSelectVisible ? undefined : true}
        >
          <div className="min-h-0 overflow-hidden">
            <Suspense
              fallback={
                <div className="h-8 w-full animate-pulse rounded-md bg-foreground/5" />
              }
            >
              {workspaceSelect({ isCollapsed, standalone: true })}
            </Suspense>
          </div>
        </div>
      ) : null}
      <div
        key={navState.history.length}
        className={cn(
          'min-h-0 flex-1 transition-transform duration-300 ease-in-out',
          navState.direction === 'forward'
            ? 'slide-in-from-right animate-in'
            : 'slide-in-from-left animate-in'
        )}
      >
        {navState.history.length === 0 ? (
          <div className="flex h-full min-h-0 flex-col">
            <div
              className={cn(
                'scrollbar-none overflow-y-auto',
                extraContent ? 'shrink-0' : 'min-h-0 flex-1'
              )}
            >
              <Nav
                isCollapsed={isCollapsed}
                links={filteredCurrentLinks}
                onClick={closeOnMobile}
                onSubMenuClick={handleSubMenuClick}
                wsId={wsId}
              />
            </div>
            {extraContent ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {extraContent}
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <Nav
              isCollapsed={isCollapsed}
              links={[backButton]}
              onClick={() => null}
              onSubMenuClick={() => null}
              wsId={wsId}
            />
            {!isCollapsed && currentTitle ? (
              <div className="p-2 pt-0">
                <h2 className="line-clamp-1 px-2 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
                  {currentTitle}
                </h2>
              </div>
            ) : null}
            {!isCollapsed ? <div className="mx-4 my-1 border-b" /> : null}
            {filteredCurrentLinks.length > 0 ? (
              <div className="scrollbar-none min-h-0 overflow-y-auto">
                <Nav
                  isCollapsed={isCollapsed}
                  links={filteredCurrentLinks}
                  onClick={closeOnMobile}
                  onSubMenuClick={handleSubMenuClick}
                  wsId={wsId}
                />
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
