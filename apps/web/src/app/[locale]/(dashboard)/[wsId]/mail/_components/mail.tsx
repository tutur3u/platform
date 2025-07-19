'use client';

import type { InternalEmail } from '@tuturuuu/types/db';
import {
  Mail as MailIcon,
  Send,
  Star,
  TextSelect,
  Trash,
  TriangleAlert,
} from '@tuturuuu/ui/icons';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@tuturuuu/ui/resizable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { TooltipProvider } from '@tuturuuu/ui/tooltip';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMail } from '../use-mail';
import { ComposeButton } from './compose-button';
import { ComposeDialog } from './compose-dialog';
import { MailDisplay } from './mail-display';
import { MailList } from './mail-list';

interface MailProps {
  mails: InternalEmail[];
  defaultLayout: number[] | undefined;
  defaultCollapsed?: boolean;
  navCollapsedSize: number;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loading?: boolean;
  wsId: string;
  hasCredential: boolean;
}

export function MailClient({
  mails,
  defaultLayout = [20, 80],
  onLoadMore,
  hasMore,
  loading,
  wsId,
  hasCredential,
}: MailProps) {
  const [mail] = useMail();
  const [composeOpen, setComposeOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('sent');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const t = useTranslations();

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
        className="h-full items-stretch"
      >
        <ResizablePanel
          defaultSize={defaultLayout[1]}
          minSize={30}
          className="flex flex-col"
        >
          <div
            ref={scrollContainerRef}
            className="h-full w-full overflow-y-auto"
          >
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              defaultValue="sent"
            >
              <div className="flex h-16 items-center justify-between border-b bg-background/50 px-4 backdrop-blur-sm">
                <TabsList className="grid w-fit gap-1 md:flex">
                  <TabsTrigger
                    value="inbox"
                    className="flex items-center gap-2"
                    disabled
                  >
                    <MailIcon className="h-4 w-4" />
                    {t('mail.inbox')}
                  </TabsTrigger>
                  <TabsTrigger
                    value="starred"
                    className="flex items-center gap-2"
                    disabled
                  >
                    <Star className="h-4 w-4" />
                    {t('mail.starred')}
                  </TabsTrigger>
                  <TabsTrigger value="sent" className="flex items-center gap-2">
                    <Send className="h-4 w-4" />
                    {t('mail.sent')}
                  </TabsTrigger>
                  <TabsTrigger
                    value="drafts"
                    className="flex items-center gap-2"
                    disabled
                  >
                    <TextSelect className="h-4 w-4" />
                    {t('mail.drafts')}
                  </TabsTrigger>
                  <TabsTrigger
                    value="spam"
                    className="flex items-center gap-2"
                    disabled
                  >
                    <TriangleAlert className="h-4 w-4" />
                    {t('mail.spam')}
                  </TabsTrigger>
                  <TabsTrigger
                    value="trash"
                    className="flex items-center gap-2"
                    disabled
                  >
                    <Trash className="h-4 w-4" />
                    {t('mail.trash')}
                  </TabsTrigger>
                </TabsList>
                {wsId === ROOT_WORKSPACE_ID && (
                  <ComposeButton
                    onClick={() => setComposeOpen(true)}
                    disabled={!hasCredential}
                  />
                )}
              </div>
              <TabsContent value="sent" className="m-0">
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
