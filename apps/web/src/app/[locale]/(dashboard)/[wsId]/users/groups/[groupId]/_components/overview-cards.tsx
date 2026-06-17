import {
  getCachedGroupLinkedProducts,
  getCachedGroupMembersPage,
  getCachedGroupPostsPage,
  getCachedGroupSchedule,
} from '@/lib/user-groups/server-cache';
import { getGroupStorageFiles } from '@/lib/user-groups/server-storage';
import type { GroupMember } from '../group-member-card';
import GroupMembers from '../group-members';
import GroupStorage, { type GroupStorageFiles } from '../group-storage';
import LinkedProductsClient from '../linked-products-client';
import PostsClient from '../posts-client';
import GroupSchedule from '../schedule';
import type { UserGroupPost } from '../use-posts';

const POSTS_PAGE_SIZE = 10;

export async function MembersCardServer({
  wsId,
  groupId,
  pageSize,
  canViewPersonalInfo,
  canViewPublicInfo,
  canUpdateUserGroups,
}: {
  wsId: string;
  groupId: string;
  pageSize: number;
  canViewPersonalInfo: boolean;
  canViewPublicInfo: boolean;
  canUpdateUserGroups: boolean;
}) {
  const page = await getCachedGroupMembersPage(
    wsId,
    groupId,
    pageSize,
    canViewPersonalInfo,
    canViewPublicInfo
  );

  return (
    <GroupMembers
      wsId={wsId}
      groupId={groupId}
      pageSize={pageSize}
      canViewPersonalInfo={canViewPersonalInfo}
      canViewPublicInfo={canViewPublicInfo}
      canUpdateUserGroups={canUpdateUserGroups}
      initialData={{ items: page.data as GroupMember[], next: page.next }}
    />
  );
}

export async function ScheduleCardServer({
  wsId,
  groupId,
  canUpdateUserGroups,
}: {
  wsId: string;
  groupId: string;
  canUpdateUserGroups: boolean;
}) {
  const schedule = await getCachedGroupSchedule(wsId, groupId);

  return (
    <GroupSchedule
      wsId={wsId}
      groupId={groupId}
      canUpdateUserGroups={canUpdateUserGroups}
      initialSchedule={schedule}
    />
  );
}

export async function PostsCardServer({
  wsId,
  groupId,
  canUpdatePosts,
  canCreatePosts,
  canDeletePosts,
  canViewPosts,
}: {
  wsId: string;
  groupId: string;
  canUpdatePosts: boolean;
  canCreatePosts: boolean;
  canDeletePosts: boolean;
  canViewPosts: boolean;
}) {
  const page = await getCachedGroupPostsPage(groupId, POSTS_PAGE_SIZE);

  return (
    <PostsClient
      wsId={wsId}
      groupId={groupId}
      canUpdatePosts={canUpdatePosts}
      canCreatePosts={canCreatePosts}
      canDeletePosts={canDeletePosts}
      canViewPosts={canViewPosts}
      initialData={{
        posts: page.data as unknown as UserGroupPost[],
        total: page.count,
        hasMore: Boolean(page.nextCursor),
        nextCursor: page.nextCursor,
      }}
    />
  );
}

export async function LinkedProductsCardServer({
  wsId,
  groupId,
  canUpdateLinkedProducts,
}: {
  wsId: string;
  groupId: string;
  canUpdateLinkedProducts: boolean;
}) {
  const linked = await getCachedGroupLinkedProducts(groupId);

  return (
    <LinkedProductsClient
      wsId={wsId}
      groupId={groupId}
      canUpdateLinkedProducts={canUpdateLinkedProducts}
      initialLinkedProducts={linked}
    />
  );
}

export async function StorageCardServer({
  wsId,
  groupId,
  canUpdateGroup,
}: {
  wsId: string;
  groupId: string;
  canUpdateGroup: boolean;
}) {
  const files = await getGroupStorageFiles(wsId, groupId);

  return (
    <GroupStorage
      wsId={wsId}
      groupId={groupId}
      canUpdateGroup={canUpdateGroup}
      initialFiles={files as unknown as GroupStorageFiles}
    />
  );
}
