'use client';

import UserGroupPosts from './posts';
import {
  type GroupPostsInitialData,
  useGroupPostsInfiniteQuery,
} from './use-posts';

export default function PostsClient({
  wsId,
  groupId,
  canUpdatePosts = false,
  canCreatePosts = false,
  canDeletePosts = false,
  canViewPosts = true,
  initialData,
}: {
  wsId: string;
  groupId: string;
  canUpdatePosts?: boolean;
  canCreatePosts?: boolean;
  canDeletePosts?: boolean;
  canViewPosts?: boolean;
  initialData?: GroupPostsInitialData;
}) {
  const {
    posts,
    totalCount,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    loadMoreRef,
    fetchNextPage,
  } = useGroupPostsInfiniteQuery(wsId, groupId, canViewPosts, initialData);

  return (
    <section className="flex flex-col overflow-hidden rounded-xl border border-border/60 bg-background p-5 shadow-sm transition-colors hover:border-border">
      <UserGroupPosts
        wsId={wsId}
        groupId={groupId}
        posts={posts}
        count={totalCount}
        canUpdatePosts={canUpdatePosts}
        canCreatePosts={canCreatePosts}
        canDeletePosts={canDeletePosts}
        canViewPosts={canViewPosts}
        isLoading={isLoading}
        isFetchingNextPage={isFetchingNextPage}
        hasNextPage={hasNextPage}
        onLoadMore={fetchNextPage}
        loadMoreRef={loadMoreRef}
      />
    </section>
  );
}
