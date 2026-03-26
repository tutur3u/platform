'use client';

import type { Database, UserGroupPost } from '@tuturuuu/types/db';
import UserCard from './card';

type GroupPostRecipientRow =
  Database['public']['Functions']['get_user_group_post_recipient_rows']['Returns'][number];

interface Props {
  recipients: GroupPostRecipientRow[];
  wsId: string;
  post: UserGroupPost;
  canUpdateUserGroupsPosts: boolean;
  canApprovePosts?: boolean;
}

export function UsersList({
  recipients,
  wsId,
  post,
  canUpdateUserGroupsPosts,
  canApprovePosts = false,
}: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {recipients.map((recipient) => (
        <div key={`post-${post.id}-${recipient.user_id}`} className="relative">
          <UserCard
            recipient={recipient}
            wsId={wsId}
            post={post}
            canUpdateUserGroupsPosts={canUpdateUserGroupsPosts}
            canApprovePosts={canApprovePosts}
          />
        </div>
      ))}
    </div>
  );
}
