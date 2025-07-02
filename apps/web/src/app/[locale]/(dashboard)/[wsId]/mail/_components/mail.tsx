'use client';

import type { PostEmail } from '@tuturuuu/types/primitives/post-email';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Mail as MailIcon, MailWarning, Send } from '@tuturuuu/ui/icons';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@tuturuuu/ui/resizable';
import { Separator } from '@tuturuuu/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { TooltipProvider } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CustomDataTable } from '@/components/custom-data-table';
import type { Mail } from '../client';
import { useMail } from '../use-mail';
import { createPostEmailKey, usePosts } from '../use-posts';
import { ComposeButton } from './compose-button';
import { ComposeDialog } from './compose-dialog';
import { MailDisplay } from './mail-display';
import { MailList } from './mail-list';
import { PostDisplay } from './post-display';
import { getPostEmailColumns } from './posts-columns';
import PostsFilters from './posts-filters';

interface SearchParams {
  page?: string;
  pageSize?: string;
  includedGroups?: string | string[];
  excludedGroups?: string | string[];
  userId?: string;
}

interface MailProps {
  mails: Mail[];
  defaultLayout: number[] | undefined;
  defaultCollapsed?: boolean;
  navCollapsedSize: number;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loading?: boolean;
  wsId: string;
  locale: string;
  postsData: PostEmail[];
  postsCount: number;
  postsStatus: { count: number | null };
  searchParams: SearchParams;
}

export function MailClient({
  mails,
  defaultLayout = [20, 32, 48],
  onLoadMore,
  hasMore,
  loading,
  wsId,
  locale,
  postsData,
  postsCount,
  postsStatus,
  searchParams,
}: MailProps) {
  const [mail] = useMail();
  const [posts, setPosts] = usePosts();
  const [composeOpen, setComposeOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('inbox');
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

  // Find selected post email
  const selectedPostEmail =
    postsData.find((item) => createPostEmailKey(item) === posts.selected) ||
    null;

  const PostsContent = () => (
    <div className="space-y-6 p-6">
      <FeatureSummary
        pluralTitle={t('ws-post-emails.plural')}
        singularTitle={t('ws-post-emails.singular')}
        description={t('ws-post-emails.description')}
      />

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="flex w-full flex-col items-center gap-1 rounded border border-dynamic-purple/15 bg-dynamic-purple/15 p-4 text-dynamic-purple">
          <div className="flex items-center gap-2 font-bold text-xl">
            <Send />
            {t('ws-post-emails.sent_emails')}
          </div>
          <Separator className="my-1 bg-dynamic-purple/15" />
          <div className="font-semibold text-xl md:text-3xl">
            {postsStatus.count || 0}
            <span className="opacity-50">/{postsCount || 0}</span>
          </div>
        </div>
        <div className="flex w-full flex-col items-center gap-1 rounded border border-dynamic-red/15 bg-dynamic-red/15 p-4 text-dynamic-red">
          <div className="flex items-center gap-2 font-bold text-xl">
            <MailWarning />
            {t('ws-post-emails.pending_emails')}
          </div>
          <Separator className="my-1 bg-dynamic-red/15" />
          <div className="font-semibold text-3xl">
            {(postsCount || 0) - (postsStatus.count || 0)}
            <span className="opacity-50">/{postsCount || 0}</span>
          </div>
        </div>
      </div>

      <CustomDataTable
        data={postsData}
        namespace="post-email-data-table"
        columnGenerator={getPostEmailColumns}
        extraData={{ locale }}
        count={postsCount}
        filters={
          <PostsFilters wsId={wsId} searchParams={searchParams} noExclude />
        }
        defaultVisibility={{
          id: false,
          email: false,
          subject: false,
          is_completed: false,
          notes: false,
          created_at: false,
          post_title: false,
          post_content: false,
        }}
        disableSearch
        onRowClick={(row) => {
          setPosts({
            ...posts,
            selected: createPostEmailKey(row),
          });
        }}
      />
    </div>
  );

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
              defaultValue="inbox"
            >
              <div className="flex h-16 items-center justify-between border-b bg-background/50 px-4 backdrop-blur-sm">
                <TabsList className="grid w-fit grid-cols-2">
                  <TabsTrigger
                    value="inbox"
                    className="flex items-center gap-2"
                  >
                    <MailIcon className="h-4 w-4" />
                    {t('mail.inbox')}
                  </TabsTrigger>
                  <TabsTrigger
                    value="posts"
                    className="flex items-center gap-2"
                  >
                    <Send className="h-4 w-4" />
                    {t('ws-post-emails.plural')}
                  </TabsTrigger>
                </TabsList>
                <ComposeButton onClick={() => setComposeOpen(true)} />
              </div>
              <TabsContent value="inbox" className="m-0">
                <MailList items={mails} hasMore={hasMore} loading={loading} />
              </TabsContent>
              <TabsContent value="posts" className="m-0">
                <PostsContent />
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
          {activeTab === 'inbox' ? (
            <MailDisplay
              mail={mails.find((item) => item.id === mail.selected) || null}
            />
          ) : (
            <PostDisplay postEmail={selectedPostEmail} />
          )}
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
