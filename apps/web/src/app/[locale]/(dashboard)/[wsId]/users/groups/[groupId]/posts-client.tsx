'use client';

import UserGroupPosts, { type UserGroupPost } from './posts';

export default function PostsClient({
  wsId,
  groupId,
  posts,
  count,
  canUpdatePosts = false,
  canCreatePosts = false,
  canDeletePosts = false,
  canViewPosts = true,
}: {
  wsId: string;
  groupId: string;
  posts: UserGroupPost[];
  count: number | null;
  canUpdatePosts?: boolean;
  canCreatePosts?: boolean;
  canDeletePosts?: boolean;
  canViewPosts?: boolean;
}) {
  return (
    <UserGroupPosts
      wsId={wsId}
      groupId={groupId}
      posts={posts}
      count={count}
      canUpdatePosts={canUpdatePosts}
      canCreatePosts={canCreatePosts}
      canDeletePosts={canDeletePosts}
      canViewPosts={canViewPosts}
    />
  );
}
