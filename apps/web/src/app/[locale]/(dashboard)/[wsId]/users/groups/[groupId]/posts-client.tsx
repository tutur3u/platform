'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import UserGroupPosts, { type UserGroupPost } from './posts';

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
  const { data } = useQuery({
    queryKey: ['group-posts', wsId, groupId],
    enabled: Boolean(wsId && groupId && canViewPosts),
    queryFn: async () => {
      const supabase = createClient();
      const { data, error, count } = await supabase
        .from('user_group_posts')
        .select('*', { count: 'exact' })
        .eq('group_id', groupId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return { posts: (data ?? []) as UserGroupPost[], count: count ?? 0 };
    },
    staleTime: 30 * 1000,
  });

  return (
    <UserGroupPosts
      wsId={wsId}
      groupId={groupId}
      posts={data?.posts ?? []}
      count={data?.count ?? 0}
      canUpdatePosts={canUpdatePosts}
      canCreatePosts={canCreatePosts}
      canDeletePosts={canDeletePosts}
      canViewPosts={canViewPosts}
    />
  );
}
