'use client';

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@tuturuuu/ui/resizable';
import { Separator } from '@tuturuuu/ui/separator';
import { Tabs, TabsContent } from '@tuturuuu/ui/tabs';
import { TooltipProvider } from '@tuturuuu/ui/tooltip';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Mail } from '../client';
import { useMail } from '../use-mail';
import { ComposeButton } from './compose-button';
import { ComposeDialog } from './compose-dialog';
import { MailDisplay } from './mail-display';
import { MailList } from './mail-list';

interface MailProps {
  mails: Mail[];
  defaultLayout: number[] | undefined;
  defaultCollapsed?: boolean;
  navCollapsedSize: number;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loading?: boolean;
  wsId: string;
}

export function MailClient({
  mails,
  defaultLayout = [20, 32, 48],
  onLoadMore,
  hasMore,
  loading,
  wsId,
}: MailProps) {
  const [mail] = useMail();
  const [composeOpen, setComposeOpen] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current || !onLoadMore || !hasMore || loading)
      return;

    const { scrollTop, scrollHeight, clientHeight } =
      scrollContainerRef.current;
    const isNearBottom = scrollTop + clientHeight >= scrollHeight - 200;

    if (isNearBottom) {
      onLoadMore();
    }
  }, [onLoadMore, hasMore, loading]);

  useEffect(() => {
    const scrollElement = scrollContainerRef.current;
    if (!scrollElement) return;

    scrollElement.addEventListener('scroll', handleScroll);
    return () => scrollElement.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  return (
    <TooltipProvider delayDuration={0}>
      <ResizablePanelGroup
        direction="horizontal"
        onLayout={(sizes: number[]) => {
          // biome-ignore lint/suspicious/noDocumentCookie: <>
          document.cookie = `react-resizable-panels:layout:mail=${JSON.stringify(
            sizes
          )}`;
        }}
        className="items-stretch"
      >
        {/*<ResizablePanel
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
        {/*</ResizablePanel>*/}
        {/*<ResizableHandle withHandle />*/}
        <ResizablePanel
          defaultSize={defaultLayout[1]}
          minSize={30}
          className="flex flex-col "
        >
          <div
            ref={scrollContainerRef}
            className="overflow-y-auto h-full w-full"
          >
            <Tabs defaultValue="all">
              <div className="flex items-center px-4 h-16">
                <h1 className="text-xl font-bold">Inbox</h1>
                <div className="ml-auto">
                  <ComposeButton onClick={() => setComposeOpen(true)} />
                </div>
                {/* <TabsList className="ml-auto">
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
                </TabsList> */}
              </div>
              <Separator className="-my-2" />
              <TabsContent value="all" className="m-0">
                <MailList items={mails} hasMore={hasMore} loading={loading} />
              </TabsContent>
            </Tabs>
          </div>
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
      <ComposeDialog
        wsId={wsId}
        open={composeOpen}
        onOpenChange={setComposeOpen}
      />
    </TooltipProvider>
  );
}
