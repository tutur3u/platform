'use client';

import UserGroupPosts, { type UserGroupPost } from './posts';

export default function PostsClient({
  wsId,
  groupId,
  posts,
  count,
  canUpdatePosts,
}: {
  wsId: string;
  groupId: string;
  posts: UserGroupPost[];
  count: number | null;
  canUpdatePosts: boolean;
}) {
  return (
    <UserGroupPosts
      wsId={wsId}
      groupId={groupId}
      posts={posts}
      count={count}
      canUpdatePosts={canUpdatePosts}
    />
  );
}
