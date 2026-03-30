'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { DataTable } from '@tuturuuu/ui/custom/tables/data-table';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQueryStates } from 'nuqs';
import { useCallback, useEffect, useState } from 'react';
import { getPostEmailColumns } from './columns';
import PostsFilters from './filters';
import { PostDisplay } from './post-display';
import { postsSearchParamParsers } from './search-params';
import { PostStatusSummary } from './status-summary';
import type {
  PostEmail,
  PostEmailStatusSummary,
  PostsSearchParams,
} from './types';
import { createPostEmailKey, usePosts } from './use-posts';

interface PostsClientProps {
  wsId: string;
  locale: string;
  canApprovePosts: boolean;
  canForceSendPosts: boolean;
  defaultDateRange: {
    start: string;
    end: string;
  };
  searchParams: PostsSearchParams;
  postsData: { data: PostEmail[]; count: number };
  postsStatus: PostEmailStatusSummary;
}

export default function PostsClient({
  wsId,
  locale,
  canApprovePosts,
  canForceSendPosts,
  defaultDateRange,
  searchParams,
  postsData,
  postsStatus,
}: PostsClientProps) {
  const t = useTranslations();
  const router = useRouter();
  const [queryState, setQueryState] = useQueryStates(postsSearchParamParsers);
  const [posts, setPosts] = usePosts();
  const [selectedPost, setSelectedPost] = useState<PostEmail | null>(null);
  const activeStage = queryState.stage ?? searchParams.stage ?? undefined;
  const currentPage = queryState.page ?? searchParams.page ?? 1;
  const currentPageSize = queryState.pageSize ?? searchParams.pageSize ?? 10;

  const handleSetParams = useCallback(
    (params: { page?: number; pageSize?: string }) => {
      void setQueryState({
        page: params.page,
        pageSize: params.pageSize ? Number(params.pageSize) : undefined,
      });
    },
    [setQueryState]
  );

  useEffect(() => {
    if (posts.selected && postsData?.data) {
      const found = postsData.data.find(
        (p: PostEmail) => createPostEmailKey(p) === posts.selected
      );
      if (found) {
        setSelectedPost(found);
        return;
      }

      const firstVisiblePost = postsData.data[0] ?? null;
      setSelectedPost(firstVisiblePost);
      if (firstVisiblePost) {
        setPosts({
          ...posts,
          selected: createPostEmailKey(firstVisiblePost),
        });
      }
      return;
    }

    const firstVisiblePost = postsData?.data?.[0] ?? null;
    setSelectedPost(firstVisiblePost);
    if (firstVisiblePost) {
      setPosts({
        ...posts,
        selected: createPostEmailKey(firstVisiblePost),
      });
      return;
    }

    setSelectedPost(null);
  }, [posts, posts.selected, postsData, setPosts]);

  return (
    <div className="space-y-6 p-6">
      <FeatureSummary
        pluralTitle={t('ws-post-emails.plural')}
        singularTitle={t('ws-post-emails.singular')}
        description={t('ws-post-emails.description')}
      />

      <PostStatusSummary
        activeStage={activeStage}
        filteredCount={postsData?.count || 0}
        summary={postsStatus}
        toolbar={
          <PostsFilters
            wsId={wsId}
            statusSummary={postsStatus}
            defaultDateRange={defaultDateRange}
          />
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(22rem,0.95fr)] xl:items-start">
        <Card className="min-w-0 border-border/60 shadow-sm">
          <CardHeader className="space-y-1 pb-3">
            <CardTitle className="text-base">
              {t('ws-post-emails.matching_recipients', {
                filtered: postsData?.count || 0,
                total: postsStatus.total,
              })}
            </CardTitle>
          </CardHeader>
          <CardContent className="min-w-0">
            <div className="min-h-144 overflow-y-auto">
              <DataTable
                data={postsData?.data || []}
                namespace="post-email-data-table"
                columnGenerator={getPostEmailColumns}
                t={t}
                extraData={{ locale }}
                count={postsData?.count || 0}
                pageIndex={Math.max(currentPage - 1, 0)}
                pageSize={currentPageSize}
                defaultVisibility={{
                  id: false,
                  email: false,
                  subject: false,
                  is_completed: false,
                  notes: false,
                  created_at: false,
                  queue_attempt_count: false,
                  queue_status: false,
                  stage: true,
                  approval_status: false,
                  post_title: false,
                  post_content: false,
                }}
                disableSearch
                onRefresh={() => router.refresh()}
                resetParams={() => {}}
                setParams={handleSetParams}
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
            canForceSendPosts={canForceSendPosts}
          />
        </div>
      </div>
    </div>
  );
}
