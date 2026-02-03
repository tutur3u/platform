'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { UserGroupPost } from '@tuturuuu/types/db';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import UserCard from './card';

interface Props {
  users: WorkspaceUser[];
  wsId: string;
  post: UserGroupPost;
  canUpdateUserGroupsPosts: boolean;
  canSendUserGroupPostEmails: boolean;
  sentEmailUserIds: string[];
  blacklistedEmails: Set<string>;
}

interface UserGroupPostCheck {
  user_id: string;
  post_id: string;
  is_completed: boolean | null;
  notes: string;
  created_at?: string;
  email_id?: string | null;
}

export function UsersList({
  users,
  wsId,
  post,
  canUpdateUserGroupsPosts,
  canSendUserGroupPostEmails,
  sentEmailUserIds,
  blacklistedEmails,
}: Props) {
  const supabase = createClient();

  // Fetch all user checks in a single query
  const { data: checksMap, isLoading } = useQuery<
    Record<string, UserGroupPostCheck>
  >({
    queryKey: ['group-post-checks', post.id, users.map((u) => u.id)],
    queryFn: async () => {
      if (!post.id || users.length === 0) return {};

      const userIds = users.map((u) => u.id);

      const { data, error } = await supabase
        .from('user_group_post_checks')
        .select('*')
        .eq('post_id', post.id)
        .in('user_id', userIds);

      if (error) {
        console.error('Error fetching checks:', error.message);
        throw error;
      }

      // Create a map of user_id -> check data
      const checksMap: Record<string, UserGroupPostCheck> = {};

      for (const check of data || []) {
        checksMap[check.user_id] = {
          ...check,
          notes: check.notes || '',
        };
      }

      // Initialize missing entries with default values
      for (const user of users) {
        if (!checksMap[user.id]) {
          checksMap[user.id] = {
            user_id: user.id,
            post_id: post.id,
            is_completed: null,
            notes: '',
          };
        }
      }

      return checksMap;
    },
    enabled: !!(post.id && users.length > 0),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {users.map((user) => (
        <div key={`post-${post.id}-${user.id}`} className="relative">
          <UserCard
            user={user}
            wsId={wsId}
            post={post}
            disableEmailSending={sentEmailUserIds.includes(user.id)}
            isEmailBlacklisted={
              user.email ? blacklistedEmails.has(user.email) : false
            }
            hideEmailSending={!canSendUserGroupPostEmails}
            canUpdateUserGroupsPosts={canUpdateUserGroupsPosts}
            initialCheck={checksMap?.[user.id]}
            isLoadingChecks={isLoading}
          />
        </div>
      ))}
    </div>
  );
}
