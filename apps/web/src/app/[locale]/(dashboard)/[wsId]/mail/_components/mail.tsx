'use client';

import { type Mail } from '../data';
import { useMail } from '../use-mail';
import { MailDisplay } from './mail-display';
import { MailList } from './mail-list';
import { Nav } from './nav';
import { Archive, Inbox, Search, Send } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@tuturuuu/ui/resizable';
import { Separator } from '@tuturuuu/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { TooltipProvider } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import * as React from 'react';

interface MailProps {
  mails: Mail[];
  defaultLayout: number[] | undefined;
  defaultCollapsed?: boolean;
  navCollapsedSize: number;
}

export function Mail({
  mails,
  defaultLayout = [20, 32, 48],
  defaultCollapsed = false,
  navCollapsedSize,
}: MailProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(defaultCollapsed);
  const [mail] = useMail();

  return (
    <TooltipProvider delayDuration={0}>
      <ResizablePanelGroup
        direction="horizontal"
        onLayout={(sizes: number[]) => {
          document.cookie = `react-resizable-panels:layout:mail=${JSON.stringify(
            sizes
          )}`;
        }}
        className="h-full max-h-[800px] items-stretch"
      >
        <ResizablePanel
          defaultSize={defaultLayout[0]}
          collapsedSize={navCollapsedSize}
          collapsible={true}
          minSize={15}
          maxSize={20}
          onCollapse={async () => {
            setIsCollapsed(true);
            await fetch('/api/v1/infrastructure/sidebar', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ collapsed: true }),
            });
          }}
          onResize={async () => {
            setIsCollapsed(false);
            await fetch('/api/v1/infrastructure/sidebar', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ collapsed: false }),
            });
          }}
          className={cn(
            isCollapsed &&
              'min-w-[50px] transition-all duration-300 ease-in-out'
          )}
        >
          <Nav
            isCollapsed={isCollapsed}
            links={[
              {
                title: 'Inbox',
                label: '128',
                icon: Inbox,
                variant: 'default',
              },
              // {
              //   title: 'Drafts',
              //   label: '9',
              //   icon: File,
              //   variant: 'ghost',
              // },
              {
                title: 'Sent',
                label: '',
                icon: Send,
                variant: 'ghost',
              },
              // {
              //   title: 'Junk',
              //   label: '23',
              //   icon: ArchiveX,
              //   variant: 'ghost',
              // },
              // {
              //   title: 'Trash',
              //   label: '',
              //   icon: Trash2,
              //   variant: 'ghost',
              // },
              {
                title: 'Archive',
                label: '',
                icon: Archive,
                variant: 'ghost',
              },
            ]}
          />
          {/*<Separator />*/}
          {/*<Nav*/}
          {/*  isCollapsed={isCollapsed}*/}
          {/*  links={[*/}
          {/*    {*/}
          {/*      title: 'Social',*/}
          {/*      label: '972',*/}
          {/*      icon: Users2,*/}
          {/*      variant: 'ghost',*/}
          {/*    },*/}
          {/*    {*/}
          {/*      title: 'Updates',*/}
          {/*      label: '342',*/}
          {/*      icon: AlertCircle,*/}
          {/*      variant: 'ghost',*/}
          {/*    },*/}
          {/*    {*/}
          {/*      title: 'Forums',*/}
          {/*      label: '128',*/}
          {/*      icon: MessagesSquare,*/}
          {/*      variant: 'ghost',*/}
          {/*    },*/}
          {/*    {*/}
          {/*      title: 'Shopping',*/}
          {/*      label: '8',*/}
          {/*      icon: ShoppingCart,*/}
          {/*      variant: 'ghost',*/}
          {/*    },*/}
          {/*    {*/}
          {/*      title: 'Promotions',*/}
          {/*      label: '21',*/}
          {/*      icon: Archive,*/}
          {/*      variant: 'ghost',*/}
          {/*    },*/}
          {/*  ]}*/}
          {/*/>*/}
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={defaultLayout[1]} minSize={30}>
          <Tabs defaultValue="all">
            <div className="flex items-center px-4 py-2">
              <h1 className="text-xl font-bold">Inbox</h1>
              <TabsList className="ml-auto">
                <TabsTrigger
                  value="all"
                  className="text-zinc-600 dark:text-zinc-200"
                >
                  All mail
                </TabsTrigger>
                <TabsTrigger
                  value="unread"
                  className="text-zinc-600 dark:text-zinc-200"
                >
                  Unread
                </TabsTrigger>
              </TabsList>
            </div>
            <Separator />
            <div className="bg-background/95 supports-[backdrop-filter]:bg-background/60 p-4 backdrop-blur">
              <form>
                <div className="relative">
                  <Search className="text-muted-foreground absolute left-2 top-2.5 h-4 w-4" />
                  <Input placeholder="Search" className="pl-8" />
                </div>
              </form>
            </div>
            <TabsContent value="all" className="m-0">
              <MailList items={mails} />
            </TabsContent>
            <TabsContent value="unread" className="m-0">
              <MailList items={mails.filter((item) => !item.read)} />
            </TabsContent>
          </Tabs>
        </ResizablePanel>
        <ResizableHandle className="hidden md:block" />
        <ResizablePanel
          className="hidden md:block"
          defaultSize={defaultLayout[2]}
          minSize={30}
        >
          <MailDisplay
            mail={mails.find((item) => item.id === mail.selected) || null}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </TooltipProvider>
  );
}
