'use client';

import { ChevronLeft, ChevronRight, Menu, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { TooltipProvider } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { type ReactNode, useEffect } from 'react';

interface StructureProps {
  isCollapsed: boolean;
  setIsCollapsed: (isCollapsed: boolean) => void;
  hideSizeToggle?: boolean;
  overlayOnExpand?: boolean;
  header?: ReactNode;
  mobileHeader?: ReactNode;
  sidebarHeader?: ReactNode;
  sidebarContent?: ReactNode;
  actions?: ReactNode;
  userPopover?: ReactNode;
  feedbackButton?: ReactNode;
  children: ReactNode;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function Structure({
  isCollapsed,
  setIsCollapsed,
  hideSizeToggle = false,
  overlayOnExpand = false,
  header,
  mobileHeader,
  sidebarHeader,
  sidebarContent,
  actions,
  userPopover,
  feedbackButton,
  children,
  onMouseEnter,
  onMouseLeave,
}: StructureProps) {
  // Lock body scroll when sidebar is open on mobile
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const isMobile = window.innerWidth < 768; // md breakpoint
    if (isMobile && !isCollapsed) {
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';

      return () => {
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        window.scrollTo(0, scrollY);
      };
    }
  }, [isCollapsed]);

  return (
    <>
      <nav className="safe-top safe-x fixed inset-x-0 top-0 z-30 max-sm:border-b md:hidden">
        <div className="bg-background/50 p-2 font-semibold backdrop-blur-md md:px-8 lg:px-16 xl:px-32">
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
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-lg md:hidden"
            onClick={() => setIsCollapsed(true)}
          />
        )}
        <div className="relative w-full">
          <aside
            className={cn(
              'group fixed top-0 right-0 left-auto z-50 flex h-dvh flex-col overflow-hidden border-l backdrop-blur-lg transition-all duration-300 ease-in-out md:left-0 md:z-20 md:border-r md:border-l-0',
              isCollapsed
                ? 'w-16 bg-background/50 max-md:w-0'
                : 'w-64 bg-background max-sm:w-full',
              isCollapsed && 'max-md:translate-x-full',
              overlayOnExpand && !isCollapsed && 'md:z-40'
            )}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
          >
            <div
              className={cn(
                'flex h-12 items-center p-2 md:px-0',
                isCollapsed ? 'justify-center' : 'py-1'
              )}
            >
              <div
                className={cn(
                  'flex h-13 w-full items-center md:px-2',
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
            <div className="scrollbar-none flex flex-1 flex-col gap-y-1 overflow-y-auto overflow-x-hidden overscroll-contain">
              {sidebarContent}
            </div>
            {feedbackButton && (
              <div
                className={cn(
                  'flex border-foreground/10 border-t p-2',
                  isCollapsed ? 'justify-center' : ''
                )}
              >
                {feedbackButton}
              </div>
            )}
            <div
              className={cn(
                'mt-auto flex border-foreground/10 border-t p-2',
                isCollapsed ? 'justify-center' : ''
              )}
            >
              {isCollapsed ? userPopover : actions}
            </div>

            {!hideSizeToggle && (
              <Button
                size="icon"
                variant="outline"
                className="absolute top-1/2 -right-4 z-10 hidden h-auto w-auto -translate-y-1/2 rounded-full border-2 bg-background p-1.5 pl-1.5 opacity-0 transition duration-500 hover:bg-accent group-hover:opacity-100 md:block"
                onClick={() => setIsCollapsed(!isCollapsed)}
              >
                {isCollapsed ? (
                  <ChevronRight className="mr-2 h-4 w-4" />
                ) : (
                  <ChevronLeft className="mr-2 h-4 w-4" />
                )}
              </Button>
            )}
          </aside>
          {/* Main content area - overflow-y-auto removed to prevent double scrollbars */}
          {/* Body element now handles page-level scrolling */}
          <main
            className={cn(
              'relative flex h-full min-h-screen flex-col overflow-x-hidden transition-all duration-300 ease-in-out',
              isCollapsed || overlayOnExpand ? 'md:pl-16' : 'md:pl-64'
            )}
          >
            {header && <div className="mb-4 hidden md:block">{header}</div>}
            <div className="safe-bottom relative h-full w-full p-2 pt-17 pl-2 md:p-4 md:pt-4">
              {children}
            </div>
          </main>
        </div>
      </TooltipProvider>
    </>
  );
}
