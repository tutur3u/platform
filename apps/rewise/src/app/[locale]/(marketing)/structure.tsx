'use client';

import LogoTitle from '../logo-title';
import { Nav } from './nav';
import { NavLink } from '@/components/navigation';
import { cn } from '@/lib/utils';
import { WorkspaceUser } from '@repo/types/primitives/WorkspaceUser';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@repo/ui/components/ui/accordion';
import { Button } from '@repo/ui/components/ui/button';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@repo/ui/components/ui/resizable';
import { Separator } from '@repo/ui/components/ui/separator';
import { TooltipProvider } from '@repo/ui/components/ui/tooltip';
import {
  ChevronDown,
  Crown,
  Home,
  ImagePlay,
  Menu,
  MessagesSquare,
  WandSparkles,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import Link from 'next/link';
import { ReactNode, useState } from 'react';

interface MailProps {
  locale: string;
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
  locale,
  defaultLayout = [20, 80],
  defaultCollapsed = false,
  navCollapsedSize,
  user,
  links,
  actions,
  userPopover,
  children,
}: MailProps) {
  const t = useTranslations();

  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  if (!user) return null;

  const rootLinks: NavLink[] = [
    {
      href: '/new',
      aliases: ['/'],
      title: t('common.home'),
      icon: <Home className="h-5 w-5 flex-none" />,
      matchExact: true,
    },
    {
      href: '/tools',
      title: t('common.tools'),
      icon: <WandSparkles className="h-5 w-5 flex-none" />,
    },
    {
      href: '/imagine',
      title: t('common.image_generator'),
      icon: <ImagePlay className="h-5 w-5 flex-none" />,
    },
    {
      href: '/plans',
      title: t('common.current_plan'),
      icon: <Crown className="h-5 w-5 flex-none" />,
      trailing: (
        <span className="bg-gradient-to-r from-dynamic-light-red via-dynamic-light-pink to-dynamic-light-blue bg-clip-text py-1 font-semibold text-transparent">
          {t('common.premium')}
        </span>
      ),
      disabled: true,
      showDisabled: true,
    },
  ];

  return (
    <>
      <nav
        id="navbar"
        className="fixed z-10 flex w-full flex-none items-center justify-between gap-2 border-b bg-background/70 px-4 py-2 backdrop-blur-lg md:hidden"
      >
        <div className="flex h-[52px] items-center gap-2">
          <div className="flex flex-none items-center gap-2">
            <Link href="/new" className="flex flex-none items-center gap-2">
              <Image
                src="/media/logos/transparent.png"
                className="h-8 w-8"
                width={32}
                height={32}
                alt="logo"
              />
              <LogoTitle />
            </Link>
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
            document.cookie = `react-resizable-panels:layout:rewise=${JSON.stringify(
              sizes
            )}`;
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
                : 'absolute inset-0 z-40 flex bg-foreground/5 md:static md:bg-transparent',
              'flex-col justify-between backdrop-blur-lg transition-all duration-300 ease-in-out'
            )}
          >
            {/* <div className="from-dynamic-light-red via-dynamic-light-pink to-dynamic-light-blue absolute -z-20 h-full w-full bg-gradient-to-r" /> */}
            <div className="absolute -z-10 h-full w-full bg-background/90" />
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
                      href="/new"
                      className="flex flex-none items-center justify-center gap-2"
                    >
                      <Image
                        src="/media/logos/transparent.png"
                        className="h-8 w-8"
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
              <div
                className={cn(
                  'scrollbar-none flex flex-1 flex-col gap-2 overflow-y-scroll transition duration-300'
                  // isCollapsed && 'hover:opacity-100 md:opacity-0'
                )}
              >
                <Nav
                  t={t}
                  locale={locale}
                  currentUser={user}
                  isCollapsed={isCollapsed}
                  links={rootLinks}
                  onClick={() => {
                    if (window.innerWidth < 768) setIsCollapsed(true);
                  }}
                  className="pb-0"
                  single
                />
                {isCollapsed || <Separator />}
                <Accordion
                  type="single"
                  className={cn('w-full', isCollapsed && 'hidden')}
                  collapsible
                >
                  <AccordionItem value="item-1" className="border-none p-0">
                    <AccordionTrigger
                      showChevron={false}
                      className="mx-2 mb-0 rounded-md bg-foreground/5 px-3 py-2 hover:bg-foreground/10"
                    >
                      <div className="flex items-center gap-2">
                        <MessagesSquare className="h-5 w-5 flex-none" />
                        <span className="line-clamp-1 text-start text-sm">
                          {t('ai_chat.chats')}
                        </span>
                      </div>
                      <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
                    </AccordionTrigger>
                    <AccordionContent>
                      <Nav
                        t={t}
                        locale={locale}
                        currentUser={user}
                        isCollapsed={isCollapsed}
                        links={links}
                        onClick={() => {
                          if (window.innerWidth < 768) setIsCollapsed(true);
                        }}
                        single={false}
                        className="pt-0"
                      />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
              <div className="flex-none border-t border-foreground/10 p-2">
                {isCollapsed ? userPopover : actions}
              </div>
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle className="hidden md:flex" />
          <ResizablePanel defaultSize={defaultLayout[1]}>
            <main
              id="main-content"
              className="relative flex h-full min-h-screen flex-col overflow-y-auto px-4 pt-20 md:pt-0 lg:px-8 xl:px-16"
            >
              {children}
            </main>
          </ResizablePanel>
        </ResizablePanelGroup>
      </TooltipProvider>
    </>
  );
}
