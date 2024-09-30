'use client';

import UserGroupPosts, { UserGroupPost } from './posts';

export default function PostsClient({
  wsId,
  groupId,
  posts,
}: {
  wsId: string;
  groupId: string;
  posts: UserGroupPost[];
}) {
  return <UserGroupPosts wsId={wsId} groupId={groupId} posts={posts} />;
}
