/** Shapes of the task comments, links, external-ref and timeline routes. */

export interface TaskActor {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface TaskComment {
  id: string;
  task_id: string;
  author: TaskActor | null;
  external_author: string | null;
  external_url: string | null;
  body: string;
  created_at: string;
  edited_at: string | null;
}

export type TaskLinkKind =
  | 'pull_request'
  | 'commit'
  | 'ci_run'
  | 'issue'
  | 'doc'
  | 'url';

export type TaskLinkState =
  | 'open'
  | 'closed'
  | 'merged'
  | 'draft'
  | 'success'
  | 'failure'
  | 'pending'
  | 'cancelled';

export interface TaskLink {
  /** Null for a legacy task_resources entry, which has no link row. */
  id: string | null;
  /** True for a legacy task_resources entry, edited through the task's links field. */
  legacy?: boolean;
  kind: TaskLinkKind;
  provider: 'github' | 'web';
  url: string;
  external_id: string | null;
  title: string | null;
  state: TaskLinkState | null;
  created_at: string | null;
  created_by: string | null;
}

export interface TaskExternalRef {
  provider: 'github';
  external_url: string;
  external_repo: string | null;
  external_number: number | null;
  external_author: string | null;
  external_state: string | null;
  external_state_reason: string | null;
  external_created_at: string | null;
  external_closed_at: string | null;
  external_labels: string[];
}

export type TaskCollaborationChangeType =
  | 'comment_added'
  | 'comment_updated'
  | 'comment_deleted'
  | 'link_added'
  | 'link_removed'
  | 'external_imported'
  | 'external_event';

export interface TaskTimelineEvent {
  id: string;
  type: string;
  at: string;
  actor: TaskActor | null;
  external_actor: string | null;
  field_name: string | null;
  old_value: unknown;
  new_value: unknown;
  metadata: Record<string, unknown> | null;
  comment?: TaskComment;
}

export type TaskStatusKey =
  | 'backlog'
  | 'todo'
  | 'in-progress'
  | 'review'
  | 'done'
  | 'cancelled';
