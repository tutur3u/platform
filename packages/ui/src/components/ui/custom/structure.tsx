'use client';

import { Button } from '@tuturuuu/ui/button';
import { TooltipProvider } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { ChevronsLeft, ChevronsRight, Menu, X } from 'lucide-react';
import { ReactNode } from 'react';

interface StructureProps {
  isCollapsed: boolean;
  // eslint-disable-next-line no-unused-vars
  setIsCollapsed: (isCollapsed: boolean) => void;
  header?: ReactNode;
  mobileHeader?: ReactNode;
  sidebarHeader?: ReactNode;
  sidebarContent?: ReactNode;
  actions?: ReactNode;
  userPopover?: ReactNode;
  children: ReactNode;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function Structure({
  isCollapsed,
  setIsCollapsed,
  header,
  mobileHeader,
  sidebarHeader,
  sidebarContent,
  actions,
  userPopover,
  children,
  onMouseEnter,
  onMouseLeave,
}: StructureProps) {
  return (
    <>
      <nav
        id="navbar"
        className="fixed inset-x-0 top-0 z-30 max-sm:border-b md:hidden"
      >
        <div
          id="navbar-content"
          className="bg-background/50 px-4 py-2 font-semibold backdrop-blur-md md:px-8 lg:px-16 xl:px-32"
        >
          <div className="relative flex items-center justify-between gap-2 md:gap-4">
            <div className="flex w-full items-center gap-2">{mobileHeader}</div>
            <div className="flex w-fit items-center gap-2">
              {userPopover}
              <Button
                size="icon"
                variant="outline"
                className="h-auto w-auto flex-none rounded-lg p-2 md:hidden"
                onClick={() => setIsCollapsed(!isCollapsed)}
              >
                <Menu className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <TooltipProvider delayDuration={0}>
        {!isCollapsed && (
          <div
            className="fixed inset-0 z-40 bg-black/20 md:hidden"
            onClick={() => setIsCollapsed(true)}
          />
        )}
        <div className="relative h-screen w-full">
          <aside
            className={cn(
              'group fixed z-50 flex h-full flex-col overflow-hidden border-r bg-background/70 backdrop-blur-lg transition-all duration-300 ease-in-out md:z-20',
              isCollapsed ? 'w-16 max-md:w-0' : 'w-72',
              'max-md:absolute',
              isCollapsed && 'max-md:-translate-x-full'
            )}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
          >
            <div
              className={cn(
                'flex h-12 items-center border-b border-foreground/10 p-2 md:px-0',
                isCollapsed ? 'justify-center' : 'max-sm:py-1'
              )}
            >
              <div
                className={cn(
                  'flex h-[52px] w-full items-center px-2',
                  isCollapsed ? 'justify-center' : ''
                )}
              >
                <div
                  className={cn(
                    'flex w-full items-center justify-between gap-2'
                  )}
                >
                  {sidebarHeader}
                  {isCollapsed || (
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-auto w-auto flex-none rounded-lg p-2 md:hidden"
                      onClick={() => setIsCollapsed(!isCollapsed)}
                    >
                      <X className="h-5 w-5" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <div className="scrollbar-none flex flex-1 flex-col gap-y-1 overflow-x-hidden overflow-y-auto">
              {sidebarContent}
            </div>
            <div
              className={cn(
                'mt-auto flex border-t border-foreground/10 p-2',
                isCollapsed ? 'justify-center' : ''
              )}
            >
              {isCollapsed ? userPopover : actions}
            </div>

            <Button
              size="icon"
              variant="outline"
              className="absolute top-1/2 -right-4 z-10 hidden h-auto w-auto -translate-y-1/2 rounded-full border-2 bg-background p-1.5 hover:bg-accent md:block"
              onClick={() => setIsCollapsed(!isCollapsed)}
            >
              {isCollapsed ? (
                <ChevronsRight className="h-4 w-4" />
              ) : (
                <ChevronsLeft className="h-4 w-4" />
              )}
            </Button>
          </aside>
          <main
            id="main-content"
            className={cn(
              'relative flex h-full min-h-screen flex-col overflow-y-auto p-4 pt-20 transition-all duration-300 ease-in-out md:pt-4',
              isCollapsed ? 'md:pl-20' : 'md:pl-76'
            )}
          >
            {header && <div className="mb-4 hidden md:block">{header}</div>}
            {children}
          </main>
        </div>
      </TooltipProvider>
    </>
  );
}
