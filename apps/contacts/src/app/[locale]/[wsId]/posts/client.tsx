'use client';

import { useQuery } from '@tanstack/react-query';
import {
  type GetWorkspacePostsQuery,
  getWorkspacePosts,
  getWorkspacePostsBootstrap,
  getWorkspacePostsPermissions,
} from '@tuturuuu/internal-api/posts';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { DataTable } from '@tuturuuu/ui/custom/tables/data-table';
import { useTranslations } from 'next-intl';
import { useQueryStates } from 'nuqs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getPostEmailColumns } from './columns';
import PostsFilters from './filters';
import {
  PostStatusSummarySkeleton,
  PostsTableSkeleton,
} from './loading-skeletons';
import { PostPreviewDialog } from './post-preview-dialog';
import {
  applyDefaultPostStageFilter,
  postsSearchParamParsers,
  shouldApplyDefaultPostStageFilter,
} from './search-params';
import { PostStatusSummary } from './status-summary';
import type {
  PostEmail,
  PostEmailStatusSummary,
  PostsSearchParams,
} from './types';
import { createPostEmailKey, usePosts } from './use-posts';

interface PostsClientProps {
  embedded?: boolean;
  wsId: string;
  locale: string;
  searchParams: PostsSearchParams;
}

export default function PostsClient({
  embedded = false,
  wsId,
  locale,
  searchParams,
}: PostsClientProps) {
  const t = useTranslations();
  const [queryState, setQueryState] = useQueryStates(postsSearchParamParsers);
  const [posts, setPosts] = usePosts();
  const [selectedPost, setSelectedPost] = useState<PostEmail | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const currentPage = queryState.page ?? searchParams.page ?? 1;
  const currentPageSize = queryState.pageSize ?? searchParams.pageSize ?? 10;
  const {
    data: bootstrap,
    error: bootstrapError,
    isLoading: isBootstrapLoading,
    refetch: refetchBootstrap,
  } = useQuery({
    queryKey: ['workspace-posts-bootstrap', wsId],
    queryFn: () => getWorkspacePostsBootstrap(wsId),
    staleTime: 60_000,
  });
  const resolvedWsId = bootstrap?.wsId;
  const defaultDateRange = bootstrap?.defaultDateRange;
  const { data: permissions, isLoading: isPermissionsLoading } = useQuery({
    queryKey: ['workspace-posts-permissions', resolvedWsId ?? wsId],
    queryFn: () => getWorkspacePostsPermissions(resolvedWsId ?? wsId),
    staleTime: 60_000,
  });
  const rawSearchParams = useMemo<PostsSearchParams>(
    () => ({
      approvalStatus:
        queryState.approvalStatus ?? searchParams.approvalStatus ?? undefined,
      end: queryState.end ?? searchParams.end ?? undefined,
      excludedGroups:
        (queryState.excludedGroups?.length ?? 0) > 0
          ? queryState.excludedGroups
          : (searchParams.excludedGroups ?? undefined),
      includedGroups:
        (queryState.includedGroups?.length ?? 0) > 0
          ? queryState.includedGroups
          : (searchParams.includedGroups ?? undefined),
      page: currentPage,
      pageSize: currentPageSize,
      queueStatus:
        queryState.queueStatus ?? searchParams.queueStatus ?? undefined,
      showAll: queryState.showAll ?? searchParams.showAll ?? undefined,
      stage: queryState.stage ?? searchParams.stage ?? undefined,
      start: queryState.start ?? searchParams.start ?? undefined,
      userId: queryState.userId ?? searchParams.userId ?? undefined,
    }),
    [currentPage, currentPageSize, queryState, searchParams]
  );
  const effectiveSearchParams = useMemo<PostsSearchParams>(() => {
    const withDefaultStage = applyDefaultPostStageFilter(rawSearchParams);

    return {
      ...withDefaultStage,
      end:
        withDefaultStage.end ??
        (withDefaultStage.start ? undefined : defaultDateRange?.end),
      start: withDefaultStage.start ?? defaultDateRange?.start,
    };
  }, [defaultDateRange, rawSearchParams]);
  const workspacePostsQuery = useMemo<GetWorkspacePostsQuery>(
    () => ({
      approvalStatus: effectiveSearchParams.approvalStatus ?? undefined,
      cursor: effectiveSearchParams.cursor ?? undefined,
      end: effectiveSearchParams.end ?? undefined,
      excludedGroups: effectiveSearchParams.excludedGroups ?? undefined,
      includedGroups: effectiveSearchParams.includedGroups ?? undefined,
      page: effectiveSearchParams.page ?? undefined,
      pageSize: effectiveSearchParams.pageSize ?? undefined,
      queueStatus: effectiveSearchParams.queueStatus ?? undefined,
      showAll: effectiveSearchParams.showAll ?? undefined,
      stage: effectiveSearchParams.stage ?? undefined,
      start: effectiveSearchParams.start ?? undefined,
      userId: effectiveSearchParams.userId ?? undefined,
    }),
    [effectiveSearchParams]
  );
  const activeStage = effectiveSearchParams.stage ?? undefined;

  useEffect(() => {
    if (!defaultDateRange) {
      return;
    }

    const nextSearchParams: Partial<PostsSearchParams> = {};

    if (!queryState.start && !queryState.end) {
      nextSearchParams.start = defaultDateRange.start;
      nextSearchParams.end = defaultDateRange.end;
    }

    if (
      shouldApplyDefaultPostStageFilter({
        approvalStatus: queryState.approvalStatus,
        queueStatus: queryState.queueStatus,
        showAll: queryState.showAll,
        stage: queryState.stage,
      })
    ) {
      nextSearchParams.stage = 'pending_approval';
    }

    if (Object.keys(nextSearchParams).length > 0) {
      void setQueryState(nextSearchParams);
    }
  }, [
    defaultDateRange,
    queryState.approvalStatus,
    queryState.end,
    queryState.queueStatus,
    queryState.showAll,
    queryState.stage,
    queryState.start,
    setQueryState,
  ]);

  const canFetchPosts = Boolean(resolvedWsId && defaultDateRange);
  const canApprovePosts = permissions?.canApprovePosts ?? false;
  const canForceSendPosts = permissions?.canForceSendPosts ?? false;
  const {
    data: postsResponse,
    error: postsError,
    isFetching,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['workspace-posts', resolvedWsId, workspacePostsQuery],
    queryFn: () =>
      getWorkspacePosts<PostEmail, PostEmailStatusSummary>(
        resolvedWsId as string,
        workspacePostsQuery
      ),
    enabled: canFetchPosts,
    placeholderData: (previousData) => previousData,
  });
  const loadError = bootstrapError ?? postsError;
  const isInitialLoading =
    isBootstrapLoading || (isLoading && !postsResponse) || !canFetchPosts;
  const postsData = postsResponse
    ? { count: postsResponse.count, data: postsResponse.data }
    : { count: 0, data: [] as PostEmail[] };
  const postsStatus =
    postsResponse?.summary ??
    ({
      approvals: { approved: 0, pending: 0, rejected: 0, skipped: 0 },
      queue: {
        blocked: 0,
        cancelled: 0,
        failed: 0,
        processing: 0,
        queued: 0,
        sent: 0,
        skipped: 0,
      },
      stages: {
        approved_awaiting_delivery: 0,
        delivery_failed: 0,
        missing_check: 0,
        pending_approval: 0,
        processing: 0,
        queued: 0,
        rejected: 0,
        sent: 0,
        skipped: 0,
        undeliverable: 0,
      },
      total: 0,
    } as PostEmailStatusSummary);

  const handleSetParams = useCallback(
    (params: { page?: number; pageSize?: string }) => {
      void setQueryState({
        page: params.page,
        pageSize: params.pageSize ? Number(params.pageSize) : undefined,
      });
    },
    [setQueryState]
  );

  const handleApprovalCompleted = useCallback(
    async (processedPost: PostEmail) => {
      const currentPosts = postsData.data ?? [];
      const processedKey = createPostEmailKey(processedPost);
      const processedIndex = currentPosts.findIndex(
        (post) => createPostEmailKey(post) === processedKey
      );
      const nextPost =
        processedIndex >= 0
          ? (currentPosts[processedIndex + 1] ??
            currentPosts[processedIndex - 1] ??
            null)
          : (currentPosts[0] ?? null);

      setSelectedPost(nextPost);
      if (!nextPost) {
        setIsPreviewOpen(false);
      }
      setPosts({
        ...posts,
        selected: nextPost ? createPostEmailKey(nextPost) : null,
      });

      await refetch();
    },
    [posts, postsData.data, refetch, setPosts]
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
    <div className={embedded ? 'space-y-6' : 'space-y-6 p-2 md:p-6'}>
      {!embedded && (
        <FeatureSummary
          pluralTitle={t('ws-post-emails.plural')}
          singularTitle={t('ws-post-emails.singular')}
          description={t('ws-post-emails.description')}
        />
      )}

      {isInitialLoading ? (
        <PostStatusSummarySkeleton />
      ) : (
        <PostStatusSummary
          activeStage={activeStage}
          filteredCount={postsData?.count || 0}
          summary={postsStatus}
          toolbar={
            resolvedWsId && defaultDateRange ? (
              <PostsFilters
                wsId={resolvedWsId}
                statusSummary={postsStatus}
                defaultDateRange={defaultDateRange}
                onRefreshPosts={() => {
                  void refetch();
                }}
                isRefreshing={isFetching}
              />
            ) : null
          }
        />
      )}

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
          <div className="relative min-h-144 overflow-y-auto">
            {loadError && !postsResponse ? (
              <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-muted-foreground">
                <p>{t('common.error_loading_data')}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void refetchBootstrap();
                    if (canFetchPosts) {
                      void refetch();
                    }
                  }}
                >
                  {t('common.refresh')}
                </Button>
              </div>
            ) : isInitialLoading ? (
              <PostsTableSkeleton rows={Math.min(currentPageSize, 10)} />
            ) : (
              <>
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
                  onRefresh={() => {
                    void refetch();
                  }}
                  resetParams={() => {}}
                  setParams={handleSetParams}
                  onRowClick={(row) => {
                    setSelectedPost(row);
                    setPosts({
                      ...posts,
                      selected: createPostEmailKey(row),
                    });
                    setIsPreviewOpen(true);
                  }}
                />
                {isFetching ? (
                  <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
                  </div>
                ) : null}
              </>
            )}
          </div>
        </CardContent>
      </Card>
      <PostPreviewDialog
        wsId={resolvedWsId ?? wsId}
        postEmail={selectedPost}
        open={isPreviewOpen}
        onOpenChange={setIsPreviewOpen}
        canApprovePosts={canApprovePosts}
        canForceSendPosts={canForceSendPosts}
        isPermissionsLoading={isPermissionsLoading}
        onApprovalCompleted={handleApprovalCompleted}
      />
    </div>
  );
}
