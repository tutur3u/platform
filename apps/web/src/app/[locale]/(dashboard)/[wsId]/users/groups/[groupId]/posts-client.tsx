'use client';

import UserGroupPosts, { UserGroupPost } from './posts';

export default function PostsClient({
  wsId,
  groupId,
  posts,
  count,
}: {
  wsId: string;
  groupId: string;
  posts: UserGroupPost[];
  count: number | null;
}) {
  return (
    <UserGroupPosts wsId={wsId} groupId={groupId} posts={posts} count={count} />
  );
}
