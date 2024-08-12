'use client';

import LogoTitle from '../../logo-title';
import WorkspaceSelect from '../../workspace-select';
import { Nav } from './_components/nav';
import { NavLink } from '@/components/navigation';
import { cn } from '@/lib/utils';
import { WorkspaceUser } from '@/types/primitives/WorkspaceUser';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@repo/ui/components/ui/resizable';
import { Separator } from '@repo/ui/components/ui/separator';
import { TooltipProvider } from '@repo/ui/components/ui/tooltip';
import Image from 'next/image';
import Link from 'next/link';
import { ReactNode, Suspense, useState } from 'react';

interface MailProps {
  wsId: string;
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
  wsId,
  defaultLayout = [20, 32, 48],
  defaultCollapsed = false,
  navCollapsedSize,
  user,
  links,
  actions,
  userPopover,
  children,
}: MailProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  return (
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
            isCollapsed &&
              'min-w-[50px] transition-all duration-300 ease-in-out',
            'flex flex-col justify-between'
          )}
        >
          <div>
            <div
              className={cn(
                'flex h-[52px] items-center justify-center',
                isCollapsed ? 'h-[52px]' : 'px-2'
              )}
            >
              <div
                className={cn(
                  isCollapsed && 'px-2',
                  'flex w-full items-center gap-2'
                )}
              >
                {isCollapsed || (
                  <Link href="/" className="flex flex-none items-center gap-2">
                    <Image
                      src="/media/logos/transparent.png"
                      className="h-8 w-8"
                      width={32}
                      height={32}
                      alt="logo"
                    />
                    <LogoTitle />
                  </Link>
                )}

                <Suspense
                  fallback={
                    <div className="bg-foreground/5 h-10 w-32 animate-pulse rounded-lg" />
                  }
                >
                  <WorkspaceSelect hideLeading={isCollapsed} />
                </Suspense>
              </div>
            </div>
            <Separator />
            <Nav
              wsId={wsId}
              currentUser={user}
              isCollapsed={isCollapsed}
              links={links}
            />
          </div>
          <div className="border-t p-2">
            {isCollapsed ? userPopover : actions}
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={defaultLayout[1]}>
          <div className="flex h-full min-h-screen flex-col overflow-y-auto p-4 pb-0 lg:px-8 xl:px-16">
            {children}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </TooltipProvider>
  );
}
