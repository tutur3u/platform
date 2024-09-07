'use client';

import LogoTitle from '../../logo-title';
import WorkspaceSelect from '../../workspace-select';
import { Nav } from './_components/nav';
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
import { usePathname } from 'next/navigation';
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
  defaultLayout = [20, 48],
  defaultCollapsed = false,
  navCollapsedSize,
  user,
  links,
  actions,
  userPopover,
  children,
}: MailProps) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  return (
    <>
      <nav
        id="navbar"
        className="bg-background/70 fixed z-40 flex w-full flex-none items-center justify-between gap-2 border-b px-4 py-2 backdrop-blur-lg md:hidden"
      >
        <div className="flex h-[52px] items-center gap-2">
          <div className="flex flex-none items-center gap-2">
            <Link href="/" className="flex flex-none items-center gap-2">
              <Image
                src="/media/logos/transparent.png"
                className="h-8 w-8"
                width={32}
                height={32}
                alt="logo"
              />
            </Link>
          </div>
          <div className="bg-foreground/20 mx-2 h-4 w-[1px] flex-none rotate-[30deg]" />
          <div className="line-clamp-1 break-all text-lg font-semibold">
            {
              links
                .filter((link) => pathname.startsWith(link.href))
                .sort((a, b) => b.href.length - a.href.length)[0]?.title
            }
          </div>
        </div>
        <div className="flex h-[52px] items-center gap-2">
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
            <div>
              <div className="py-2 md:p-0">
                <div
                  className={cn(
                    'flex h-[52px] items-center justify-center',
                    isCollapsed ? 'h-[52px]' : 'px-2'
                  )}
                >
                  <div
                    className={cn(
                      isCollapsed ? 'px-2' : 'px-2 md:px-0',
                      'flex w-full items-center gap-2'
                    )}
                  >
                    {isCollapsed || (
                      <Link
                        href="/"
                        className="flex flex-none items-center gap-2"
                      >
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
                    {isCollapsed || (
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-auto w-auto flex-none rounded-lg p-2 md:hidden"
                        onClick={() => setIsCollapsed((prev) => !prev)}
                      >
                        <X className="h-5 w-5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              <Separator />
              <Nav
                wsId={wsId}
                currentUser={user}
                isCollapsed={isCollapsed}
                links={links}
                onClick={() => window.innerWidth < 768 && setIsCollapsed(true)}
              />
            </div>
            <div className="border-foreground/10 border-t p-2">
              {isCollapsed ? userPopover : actions}
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle className="hidden md:flex" />
          <ResizablePanel defaultSize={defaultLayout[1]}>
            <main
              id="main-content"
              className="relative flex h-full min-h-screen flex-col overflow-y-auto p-4 pb-48 pt-20 md:pb-64 md:pt-4 lg:px-8 lg:pb-96 xl:px-16"
            >
              {children}
            </main>
          </ResizablePanel>
        </ResizablePanelGroup>
      </TooltipProvider>
    </>
  );
}
