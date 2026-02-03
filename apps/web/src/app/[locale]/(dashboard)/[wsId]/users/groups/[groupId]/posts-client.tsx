'use client';

import UserGroupPosts from './posts';
import { useGroupPostsInfiniteQuery } from './use-posts';

export default function PostsClient({
  wsId,
  groupId,
  canUpdatePosts = false,
  canCreatePosts = false,
  canDeletePosts = false,
  canViewPosts = true,
}: {
  wsId: string;
  groupId: string;
  canUpdatePosts?: boolean;
  canCreatePosts?: boolean;
  canDeletePosts?: boolean;
  canViewPosts?: boolean;
}) {
  const {
    posts,
    totalCount,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    loadMoreRef,
    fetchNextPage,
  } = useGroupPostsInfiniteQuery(wsId, groupId, canViewPosts);

  return (
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
  );
}
