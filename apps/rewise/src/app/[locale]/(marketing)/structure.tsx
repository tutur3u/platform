'use client';

import LogoTitle from '../logo-title';
import { Nav } from './nav';
import { NavLink } from '@/components/navigation';
import { cn } from '@/lib/utils';
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import { Button } from '@repo/ui/components/ui/button';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@repo/ui/components/ui/resizable';
import { Separator } from '@repo/ui/components/ui/separator';
import { TooltipProvider } from '@repo/ui/components/ui/tooltip';
import { Menu, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { ReactNode, useState } from 'react';

interface MailProps {
  defaultLayout: number[] | undefined;
  defaultCollapsed?: boolean;
  navCollapsedSize: number;
  user: WorkspaceUser | null;
  links: NavLink[];
  actions: ReactNode;
  userPopover: ReactNode;
  children: ReactNode;
}

export function Structure({
  defaultLayout = [20, 32],
  defaultCollapsed = false,
  navCollapsedSize,
  user,
  links,
  actions,
  userPopover,
  children,
}: MailProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  if (!user) return null;

  return (
    <>
      <nav
        id="navbar"
        className="flex flex-none items-center justify-between gap-2 border-b px-4 py-2 md:hidden"
      >
        <div className="flex items-center gap-2">
          <div className="flex flex-none items-center gap-2">
            <Link
              href="/?refresh=true"
              className="flex flex-none items-center gap-2"
            >
              <Image
                src="/media/logos/transparent.png"
                className="h-9 w-9"
                width={32}
                height={32}
                alt="logo"
              />
              <LogoTitle />
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {userPopover}
          <Button
            size="icon"
            variant="outline"
            className="h-auto w-auto flex-none rounded-lg p-2 md:hidden"
            onClick={() => setIsCollapsed((prev) => !prev)}
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </nav>
      <TooltipProvider delayDuration={0}>
        <ResizablePanelGroup
          direction="horizontal"
          onLayout={(sizes: number[]) => {
            document.cookie = `react-resizable-panels:layout:mail=${JSON.stringify(
              sizes
            )}`;
          }}
          className="h-screen max-h-screen items-stretch"
        >
          <ResizablePanel
            defaultSize={defaultLayout[0]}
            collapsedSize={navCollapsedSize}
            collapsible={true}
            minSize={15}
            maxSize={20}
            onCollapse={() => {
              setIsCollapsed(true);
              document.cookie = `react-resizable-panels:collapsed=${JSON.stringify(
                true
              )}`;
            }}
            onResize={() => {
              setIsCollapsed(false);
              document.cookie = `react-resizable-panels:collapsed=${JSON.stringify(
                false
              )}`;
            }}
            className={cn(
              isCollapsed
                ? 'hidden min-w-[50px] md:flex'
                : 'bg-foreground/5 absolute inset-0 z-40 flex md:static md:bg-transparent',
              'flex-col justify-between backdrop-blur-lg transition-all duration-300 ease-in-out'
            )}
          >
            <div className="flex h-full flex-1 flex-col">
              <div className="flex-none py-2 md:p-0">
                <div
                  className={cn(
                    'flex h-[52px] items-center justify-center',
                    isCollapsed ? 'h-[52px]' : 'px-2'
                  )}
                >
                  <div
                    className={cn(
                      isCollapsed
                        ? 'justify-between md:justify-center md:px-2'
                        : 'px-2 md:px-0',
                      'flex w-full items-center gap-2'
                    )}
                  >
                    <Link
                      href="/?refresh=true"
                      className="flex flex-none items-center justify-center gap-2"
                    >
                      <Image
                        src="/media/logos/transparent.png"
                        className="h-9 w-9"
                        width={32}
                        height={32}
                        alt="logo"
                      />
                      {isCollapsed || <LogoTitle />}
                    </Link>

                    <div className="w-full md:hidden" />

                    <Button
                      size="icon"
                      variant="outline"
                      className={cn(
                        isCollapsed && 'md:hidden',
                        'h-auto w-auto flex-none rounded-lg p-2 md:hidden'
                      )}
                      onClick={() => setIsCollapsed((prev) => !prev)}
                    >
                      <X className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
                <Separator />
              </div>
              <div className="scrollbar-none flex flex-1 flex-col gap-1 overflow-y-scroll">
                <Nav
                  currentUser={user}
                  isCollapsed={isCollapsed}
                  links={links}
                  onClick={() =>
                    window.innerWidth < 768 && setIsCollapsed(true)
                  }
                />
              </div>
              <div className="border-foreground/10 flex-none border-t p-2">
                {isCollapsed ? userPopover : actions}
              </div>
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle className="hidden md:flex" />
          <ResizablePanel defaultSize={defaultLayout[1]}>
            <main
              id="main-content"
              className="relative flex h-full min-h-screen flex-col overflow-y-auto p-4 pb-48 md:pb-64 lg:px-8 lg:pb-96 xl:px-16"
            >
              {children}
            </main>
          </ResizablePanel>
        </ResizablePanelGroup>
      </TooltipProvider>
    </>
  );
}
