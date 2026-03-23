import type {
  Database,
  EmailHistoryEntry,
  GroupPostCheck,
  UserGroupPost,
  WorkspaceUser,
} from '@tuturuuu/types/db';

export type PostEmailQueueRow =
  Database['public']['Tables']['post_email_queue']['Row'];
export type PostEmailQueueInsert =
  Database['public']['Tables']['post_email_queue']['Insert'];
export type PostEmailQueueUpdate =
  Database['public']['Tables']['post_email_queue']['Update'];
export type PostEmailQueueStatus = PostEmailQueueRow['status'];

export type WorkspaceUserGroupRow =
  Database['public']['Tables']['workspace_user_groups']['Row'];
export type WorkspaceUserLinkedUserRow =
  Database['public']['Tables']['workspace_user_linked_users']['Row'];
export type WorkspaceEmailCredentialRow =
  Database['public']['Tables']['workspace_email_credentials']['Row'];

export type ExistingQueueState = Pick<
  PostEmailQueueRow,
  'id' | 'user_id' | 'status'
>;

export type EligibleRecipient = {
  user_id: GroupPostCheck['user_id'];
  email: WorkspaceUser['email'];
  approved_by: GroupPostCheck['approved_by'];
};

export type EligibleRecipientCheckRow = Pick<
  GroupPostCheck,
  'user_id' | 'is_completed' | 'approval_status' | 'approved_by'
> & {
  user: Pick<WorkspaceUser, 'id' | 'email' | 'ws_id'> | null;
};

export type OldApprovedCheckRow = Pick<
  GroupPostCheck,
  'post_id' | 'user_id'
> & {
  user_group_posts: Pick<UserGroupPost, 'id' | 'group_id' | 'created_at'> & {
    workspace_user_groups:
      | Pick<WorkspaceUserGroupRow, 'id' | 'ws_id'>
      | Array<Pick<WorkspaceUserGroupRow, 'id' | 'ws_id'>>
      | null;
  };
};

export type OrphanedApprovedCheckRow = Pick<
  GroupPostCheck,
  'post_id' | 'user_id' | 'approved_by' | 'is_completed'
> & {
  user: Pick<WorkspaceUser, 'id' | 'email'> | null;
  user_group_posts: Pick<UserGroupPost, 'id' | 'group_id' | 'created_at'> & {
    workspace_user_groups:
      | Pick<WorkspaceUserGroupRow, 'ws_id'>
      | Array<Pick<WorkspaceUserGroupRow, 'ws_id'>>
      | null;
  };
};

export type PrefetchedPost = Pick<
  UserGroupPost,
  'id' | 'group_id' | 'title' | 'content' | 'created_at'
> & {
  group_name?: WorkspaceUserGroupRow['name'] | null;
};

export type PrefetchedPostCheck = Pick<
  GroupPostCheck,
  'post_id' | 'user_id' | 'notes' | 'is_completed' | 'approval_status'
> & {
  user: Pick<
    WorkspaceUser,
    'id' | 'email' | 'full_name' | 'display_name'
  > | null;
};

export type PrefetchedSentEmail = Pick<EmailHistoryEntry, 'id' | 'created_at'>;

export type PostSendContext = {
  post: PrefetchedPost;
  recipient: {
    id: GroupPostCheck['user_id'];
    email: NonNullable<WorkspaceUser['email']>;
    username: string;
    notes: GroupPostCheck['notes'];
    is_completed: GroupPostCheck['is_completed'];
  };
};

export type BatchPrefetch = {
  posts: Map<PostEmailQueueRow['post_id'], PrefetchedPost | null>;
  checks: Map<string, PrefetchedPostCheck>;
  existingSentEmails: Map<string, PrefetchedSentEmail>;
};
