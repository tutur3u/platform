'use client';

import UserGroupPosts, { type UserGroupPost } from './posts';

export default function PostsClient({
  wsId,
  groupId,
  posts,
  count,
  canCreateUserGroups,
  canUpdateUserGroups,
  canDeleteUserGroups,
}: {
  wsId: string;
  groupId: string;
  posts: UserGroupPost[];
  count: number | null;
  canCreateUserGroups: boolean;
  canUpdateUserGroups: boolean;
  canDeleteUserGroups: boolean;
}) {
  return (
    <UserGroupPosts
      wsId={wsId}
      groupId={groupId}
      posts={posts}
      count={count}
      canCreateUserGroups={canCreateUserGroups}
      canUpdateUserGroups={canUpdateUserGroups}
      canDeleteUserGroups={canDeleteUserGroups}
    />
  );
}
