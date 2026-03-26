import type { EmailService } from '@tuturuuu/email-service';
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

export type PostEmailQueueUpsertRow = Omit<
  PostEmailQueueInsert,
  'id' | 'created_at' | 'updated_at'
>;

export type QueueStatusUpdate = Pick<
  Database['public']['Tables']['post_email_queue']['Update'],
  'status' | 'batch_id' | 'claimed_at' | 'cancelled_at' | 'last_error'
>;

export type QueueSkipUpdate = QueueStatusUpdate & {
  status: 'skipped';
  batch_id: null;
  claimed_at: null;
  cancelled_at: string;
  last_error: string;
};

export type QueueSkipTarget = Pick<
  PostEmailQueueRow,
  'post_id' | 'user_id' | 'ws_id' | 'group_id'
>;

export type PostScopeRow = Pick<
  Database['public']['Tables']['user_group_posts']['Row'],
  'id' | 'group_id' | 'created_at'
> & {
  workspace_user_groups: Pick<WorkspaceUserGroupRow, 'ws_id'> | null;
};

export type SentReceiverRow = Pick<
  Database['public']['Tables']['sent_emails']['Row'],
  'receiver_id'
>;

export type QueueSenderRow = Pick<
  Database['public']['Tables']['post_email_queue']['Row'],
  'post_id' | 'user_id' | 'sender_platform_user_id'
>;

export type QueueIdPostRow = Pick<
  Database['public']['Tables']['post_email_queue']['Row'],
  'id' | 'post_id'
>;

export type QueueIdPostUserRow = Pick<
  Database['public']['Tables']['post_email_queue']['Row'],
  'id' | 'post_id' | 'user_id'
>;

export type BatchSourceInfo = Pick<
  WorkspaceEmailCredentialRow,
  'source_name' | 'source_email'
>;

export type BatchPrefetchContext = BatchPrefetch & {
  emailServices: Map<string, EmailService>;
  sourceInfos: Map<string, BatchSourceInfo>;
};

export type BatchProcessResult = {
  id: PostEmailQueueRow['id'];
  status: PostEmailQueueRow['status'];
};

export type QueuePatch = Pick<
  PostEmailQueueUpdate,
  | 'status'
  | 'batch_id'
  | 'cancelled_at'
  | 'blocked_reason'
  | 'last_error'
  | 'sent_at'
  | 'sent_email_id'
>;

export type PrefetchPostRow = Pick<
  UserGroupPost,
  'id' | 'group_id' | 'title' | 'content' | 'created_at'
> & {
  workspace_user_groups:
    | Pick<WorkspaceUserGroupRow, 'ws_id' | 'name'>
    | Array<Pick<WorkspaceUserGroupRow, 'ws_id' | 'name'>>
    | null;
};

export type PrefetchCheckRow = Pick<
  GroupPostCheck,
  'post_id' | 'user_id' | 'notes' | 'is_completed' | 'approval_status'
> & {
  user: Pick<
    WorkspaceUser,
    'id' | 'email' | 'full_name' | 'display_name'
  > | null;
};

export type PrefetchSentEmailRow = Pick<
  EmailHistoryEntry,
  'id' | 'post_id' | 'receiver_id' | 'created_at'
>;

export type QueueClaimUpdate = Pick<
  PostEmailQueueUpdate,
  | 'status'
  | 'batch_id'
  | 'claimed_at'
  | 'last_attempt_at'
  | 'attempt_count'
  | 'cancelled_at'
>;

export type QueueClaimedRow = Omit<PostEmailQueueRow, 'status'> & {
  status: 'processing';
};

export type EligibleRecipientsDiagnostics = {
  eligibleRecipients: number;
  missingCompletion: number;
  missingEmail: number;
  missingUserRecord: number;
  notApproved: number;
  rowsWithUserData: number;
  totalCheckRows: number;
};

export type EnqueueApprovedPostEmailsDiagnostics = {
  alreadySent: number;
  eligibleRecipients: number;
  existingProcessing: number;
  existingQueued: number;
  existingSkipped: number;
  missingCompletion: number;
  missingEmail: number;
  missingSenderPlatformUser: number;
  missingUserRecord: number;
  notApproved: number;
  upserted: number;
};

export type ReconcileOrphanedApprovedPostsDiagnostics = {
  alreadySent: number;
  checked: number;
  coveredByExistingQueue: number;
  eligibleRecipients: number;
  existingProcessing: number;
  existingQueued: number;
  existingSkipped: number;
  missingCompletion: number;
  missingEmail: number;
  missingSenderPlatformUser: number;
  missingUserRecord: number;
  notApproved: number;
  orphaned: number;
  upserted: number;
};
