export type NotificationType =
  | 'task_assigned'
  | 'task_updated'
  | 'task_completed'
  | 'task_reopened'
  | 'task_priority_changed'
  | 'task_due_date_changed'
  | 'task_start_date_changed'
  | 'task_estimation_changed'
  | 'task_moved'
  | 'task_mention'
  | 'task_title_changed'
  | 'task_description_changed'
  | 'task_label_added'
  | 'task_label_removed'
  | 'task_project_linked'
  | 'task_project_unlinked'
  | 'task_assignee_removed'
  | 'deadline_reminder'
  | 'workspace_invite'
  | 'system_announcement'
  | 'account_update'
  | 'security_alert'
  | 'report_approved'
  | 'report_rejected'
  | 'post_approved'
  | 'post_rejected'
  | 'time_tracking_request_submitted'
  | 'time_tracking_request_resubmitted'
  | 'time_tracking_request_approved'
  | 'time_tracking_request_rejected'
  | 'time_tracking_request_needs_info'
  | 'topic_assigned'
  | 'mail_received'
  | 'chat_message';

export interface NotificationActor {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface Notification {
  id: string;
  /** Null for user-scoped notifications. */
  ws_id: string | null;
  user_id: string;
  type: NotificationType;
  title: string;
  description: string | null;
  code?: string | null;
  data: Record<string, any>;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
  created_by: string | null;
  actor: NotificationActor | null;
}

export interface NotificationsPage {
  notifications: Notification[];
  count: number;
  limit: number;
  offset: number;
}

export type NotificationFilter = 'unread' | 'all';

/** Result of a bulk mark-all-read request, in the scope it was applied to. */
export interface MarkAllReadResult {
  /** Workspace id, or 'all' for every notification the actor can access. */
  scope: string;
  /** Ids the server changed; null when the server did not report them. */
  ids: string[] | null;
  /**
   * Opaque per-row read-state revisions aligned with `ids`; required for a
   * conditional undo, null when the change cannot be undone.
   */
  undoRevisions: string[] | null;
}

export interface UndoMarkAllResult {
  requested: number;
  restored: string[];
}
