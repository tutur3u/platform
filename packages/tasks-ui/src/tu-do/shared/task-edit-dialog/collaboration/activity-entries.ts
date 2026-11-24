import type { TaskComment, TaskTimelineEvent } from './types';

/** Represents a task history entry from the history or timeline API. */
export interface TaskHistoryEntry {
  id: string;
  task_id: string;
  changed_by: string | null;
  changed_at: string;
  change_type:
    | 'task_created'
    | 'field_updated'
    | 'assignee_added'
    | 'assignee_removed'
    | 'label_added'
    | 'label_removed'
    | 'project_linked'
    | 'project_unlinked'
    | 'comment_added'
    | 'comment_updated'
    | 'comment_deleted'
    | 'link_added'
    | 'link_removed'
    | 'external_imported'
    | 'external_event';
  field_name?: string | null;
  old_value: unknown;
  new_value: unknown;
  metadata: Record<string, unknown>;
  user: {
    id: string;
    name: string;
    avatar_url?: string | null;
  } | null;
  /** GitHub login when the event was recorded for an external actor. */
  external_actor?: string | null;
  /** Comment body for comment_added events. */
  comment?: TaskComment | null;
}

const EXTERNAL_ACTOR_KEYS = [
  'external_author',
  'external_actor',
  'actor',
  'login',
] as const;

function externalActorOf(event: TaskTimelineEvent) {
  if (event.external_actor) return event.external_actor;
  for (const key of EXTERNAL_ACTOR_KEYS) {
    const value = event.metadata?.[key];
    if (typeof value === 'string' && value) return value;
  }
  return null;
}

/** Adapts a timeline route event to the entry shape the activity list renders. */
export function timelineEventToEntry(
  taskId: string,
  event: TaskTimelineEvent
): TaskHistoryEntry {
  return {
    id: event.id,
    task_id: taskId,
    changed_by: event.actor?.id ?? null,
    changed_at: event.at,
    change_type: event.type as TaskHistoryEntry['change_type'],
    field_name: event.field_name,
    old_value: event.old_value,
    new_value: event.new_value,
    metadata: event.metadata ?? {},
    user: event.actor
      ? {
          id: event.actor.id,
          name: event.actor.display_name ?? '',
          avatar_url: event.actor.avatar_url,
        }
      : null,
    external_actor: event.actor ? null : externalActorOf(event),
    comment: event.comment ?? null,
  };
}
