'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { CustomDataTable } from '@/components/custom-data-table';
import { getPostEmailColumns } from './columns';
import PostsFilters from './filters';
import { PostDisplay } from './post-display';
import { PostStatusSummary } from './status-summary';
import type {
  PostEmail,
  PostEmailQueueStatus,
  PostEmailStatusSummary,
  PostsSearchParams,
} from './types';
import { isPostEmailQueueStatus } from './types';
import { createPostEmailKey, usePosts } from './use-posts';

interface PostsClientProps {
  wsId: string;
  locale: string;
  canApprovePosts: boolean;
  searchParams: PostsSearchParams;
  postsData: { data: PostEmail[]; count: number };
  postsStatus: PostEmailStatusSummary;
}

export default function PostsClient({
  wsId,
  locale,
  canApprovePosts,
  searchParams,
  postsData,
  postsStatus,
}: PostsClientProps) {
  const t = useTranslations();
  const [posts, setPosts] = usePosts();
  const [selectedPost, setSelectedPost] = useState<PostEmail | null>(null);
  const activeQueueStatus = isPostEmailQueueStatus(searchParams.queueStatus)
    ? (searchParams.queueStatus as PostEmailQueueStatus)
    : undefined;

  useEffect(() => {
    if (posts.selected && postsData?.data) {
      const found = postsData.data.find(
        (p: PostEmail) => createPostEmailKey(p) === posts.selected
      );
      setSelectedPost(found || null);
      return;
    }

    setSelectedPost(null);
  }, [posts.selected, postsData]);

  return (
    <div className="space-y-6 p-6">
      <FeatureSummary
        pluralTitle={t('ws-post-emails.plural')}
        singularTitle={t('ws-post-emails.singular')}
        description={t('ws-post-emails.description')}
      />

      <PostStatusSummary
        activeQueueStatus={activeQueueStatus}
        filteredCount={postsData?.count || 0}
        summary={postsStatus}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(22rem,0.95fr)] xl:items-start">
        <Card className="min-w-0 border-border/60 shadow-sm">
          <CardHeader className="space-y-1 pb-3">
            <CardTitle className="text-base">
              {t('ws-post-emails.matching_deliveries', {
                filtered: postsData?.count || 0,
                total: postsStatus.total,
              })}
            </CardTitle>
          </CardHeader>
          <CardContent className="min-w-0">
            <div className="min-h-144 overflow-y-auto">
              <CustomDataTable
                data={postsData?.data || []}
                namespace="post-email-data-table"
                columnGenerator={getPostEmailColumns}
                extraData={{ locale }}
                count={postsData?.count || 0}
                filters={
                  <PostsFilters
                    wsId={wsId}
                    searchParams={searchParams}
                    statusSummary={postsStatus}
                  />
                }
                defaultVisibility={{
                  id: false,
                  email: false,
                  subject: false,
                  is_completed: false,
                  notes: false,
                  created_at: false,
                  queue_attempt_count: false,
                  queue_status: false,
                  approval_status: false,
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
          </CardContent>
        </Card>
        <div className="xl:sticky xl:top-6 xl:h-[calc(100vh-3rem)] xl:self-start xl:overflow-y-auto">
          <PostDisplay
            wsId={wsId}
            postEmail={selectedPost}
            canApprovePosts={canApprovePosts}
          />
        </div>
      </div>
    </div>
  );
}
