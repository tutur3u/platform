'use client';

import { Button } from '@tuturuuu/ui/button';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@tuturuuu/ui/resizable';
import { TooltipProvider } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { Menu, X } from 'lucide-react';
import { ReactNode } from 'react';

interface StructureProps {
  defaultLayout?: number[];
  navCollapsedSize: number;
  isCollapsed: boolean;
  setIsCollapsed: (isCollapsed: boolean) => void;
  debouncedSaveSizes?: (sizes: { sidebar: number; main: number }) => void;
  debouncedSaveCollapsed?: (collapsed: boolean) => void;
  header?: ReactNode;
  mobileHeader?: ReactNode;
  sidebarHeader?: ReactNode;
  sidebarContent?: ReactNode;
  actions?: ReactNode;
  userPopover?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Structure({
  defaultLayout = [20, 80],
  navCollapsedSize,
  isCollapsed,
  setIsCollapsed,
  debouncedSaveSizes,
  debouncedSaveCollapsed,
  header,
  mobileHeader,
  sidebarHeader,
  sidebarContent,
  actions,
  userPopover,
  className,
  children,
}: StructureProps) {
  return (
    <>
      <nav
        id="navbar"
        className="fixed z-20 flex w-full flex-none items-center justify-between gap-2 border-b bg-background/70 px-6 py-2 backdrop-blur-lg md:hidden"
      >
        <div className="flex h-[52px] items-center gap-2">{mobileHeader}</div>
        <div className="flex h-[52px] items-center gap-2">
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
      </nav>

      <TooltipProvider delayDuration={0}>
        <ResizablePanelGroup
          direction="horizontal"
          onLayout={(sizes: number[]) => {
            const [sidebar, main] = sizes;
            if (typeof sidebar === 'number' && typeof main === 'number') {
              debouncedSaveSizes?.({ sidebar, main });
            }
          }}
          className={cn(
            'fixed h-screen max-h-screen items-stretch',
            isCollapsed ? 'z-0' : 'z-20'
          )}
        >
          <ResizablePanel
            defaultSize={defaultLayout[0]}
            collapsedSize={navCollapsedSize}
            collapsible={true}
            minSize={15}
            maxSize={40}
            onCollapse={() => {
              setIsCollapsed(true);
              debouncedSaveCollapsed?.(true);
            }}
            onResize={() => {
              setIsCollapsed(false);
              debouncedSaveCollapsed?.(false);
            }}
            className={cn(
              isCollapsed
                ? 'hidden min-w-[50px] md:flex md:bg-background/70'
                : 'absolute inset-0 z-40 flex bg-background/70 md:static md:bg-background',
              'flex-col overflow-hidden backdrop-blur-lg transition-all duration-300 ease-in-out'
            )}
          >
            <div
              className={cn(
                'items-center border-b border-foreground/10 p-2 md:flex md:h-16 md:p-0',
                isCollapsed ? 'justify-center' : ''
              )}
            >
              <div
                className={cn(
                  'flex h-[52px] items-center justify-center',
                  isCollapsed ? 'h-[52px]' : 'px-4'
                )}
              >
                <div
                  className={cn(
                    isCollapsed ? 'px-2' : '',
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
            <div className="scrollbar-none flex flex-1 flex-col gap-4 overflow-auto">
              {sidebarContent}
            </div>
            <div className="border-t border-foreground/10 p-2">
              {isCollapsed ? userPopover : actions}
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle className="hidden md:flex" />
          <ResizablePanel defaultSize={defaultLayout[1]}>
            <main
              id="main-content"
              className={cn(
                'relative flex h-full min-h-screen flex-col overflow-y-auto p-4 pt-20 md:pt-4',
                className
              )}
            >
              {header && <div className="mb-4 hidden md:block">{header}</div>}
              {children}
            </main>
          </ResizablePanel>
        </ResizablePanelGroup>
      </TooltipProvider>
    </>
  );
}
