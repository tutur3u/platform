import { quotePostgrestValue } from '@tuturuuu/utils/postgrest-filter';
import { NextResponse } from 'next/server';
import type { TopicAnnouncementsSupabaseClient } from './read-helpers';

/**
 * Teacher-scoped access for teacher-assigned topics.
 *
 * Supervisors keep the workspace-wide scope (`manage_users`). A teacher without
 * `manage_users` may still work on a topic when they hold the matching user
 * group post permission AND the topic is assigned to them: directly
 * (`teacher_workspace_user_id` is their linked workspace user), or, only while
 * no teacher is assigned, through the class (`group_id` is a group where they
 * are a TEACHER). A co-teacher of the class cannot act on a topic assigned to
 * another teacher. Teachers never create topics; supervisors do.
 */
export type TopicAnnouncementTeacherAccess = 'read' | 'send' | 'update';

export interface TopicAnnouncementAccessOptions {
  requireManage?: boolean;
  requireSend?: boolean;
  /** Allow the assignment-scoped teacher branch for this operation. */
  teacherAccess?: TopicAnnouncementTeacherAccess;
}

export type TopicAnnouncementAccessScope =
  | { kind: 'manager' }
  | { groupIds: string[]; kind: 'teacher'; workspaceUserId: string };

export type TopicAnnouncementAccessMode = 'denied' | 'manager' | 'teacher';

export const TOPIC_ANNOUNCEMENT_TEACHER_PERMISSIONS: Record<
  TopicAnnouncementTeacherAccess,
  readonly string[]
> = {
  read: ['create_user_groups_posts', 'update_user_groups_posts'],
  send: ['send_user_group_post_emails'],
  update: ['update_user_groups_posts'],
};

/** Pure permission decision; assignment is checked per row afterwards. */
export function decideTopicAnnouncementAccessMode({
  hasPermission,
  requireManage = false,
  requireSend = false,
  teacherAccess,
  teacherAssignmentsEnabled = false,
}: TopicAnnouncementAccessOptions & {
  hasPermission: (permission: string) => boolean;
  /** The teacher branch exists only when teacher assignments are enabled. */
  teacherAssignmentsEnabled?: boolean;
}): TopicAnnouncementAccessMode {
  const canManage = hasPermission('manage_users');
  const managerAllowed =
    (!requireManage || canManage) &&
    (!requireSend ||
      (canManage && hasPermission('send_user_group_post_emails')));
  if (managerAllowed) return 'manager';

  if (!teacherAccess || !teacherAssignmentsEnabled) return 'denied';
  return TOPIC_ANNOUNCEMENT_TEACHER_PERMISSIONS[teacherAccess].some(
    hasPermission
  )
    ? 'teacher'
    : 'denied';
}

export interface TopicAnnouncementAssignmentRow {
  group_id?: string | null;
  teacher_workspace_user_id?: string | null;
}

export function isTopicAnnouncementAssignedToScope(
  row: TopicAnnouncementAssignmentRow,
  scope: TopicAnnouncementAccessScope | undefined
) {
  if (!scope || scope.kind === 'manager') return true;
  if (row.teacher_workspace_user_id) {
    return row.teacher_workspace_user_id === scope.workspaceUserId;
  }
  return Boolean(row.group_id && scope.groupIds.includes(row.group_id));
}

/**
 * PostgREST `or` filter body limiting a query to the teacher's topics. Matches
 * {@link isTopicAnnouncementAssignedToScope}.
 */
export function buildTopicAnnouncementTeacherFilter(
  scope: Extract<TopicAnnouncementAccessScope, { kind: 'teacher' }>
) {
  const filters = [`teacher_workspace_user_id.eq.${scope.workspaceUserId}`];
  if (scope.groupIds.length > 0) {
    filters.push(
      `and(teacher_workspace_user_id.is.null,group_id.in.(${scope.groupIds.join(',')}))`
    );
  }
  return filters.join(',');
}

/** PostgREST `or` filter body for the list search box. */
export function buildTopicAnnouncementSearchFilter(q: string) {
  const pattern = quotePostgrestValue(`%${q}%`);
  return ['title', 'topic', 'class_label']
    .map((column) => `${column}.ilike.${pattern}`)
    .join(',');
}

/**
 * Single `or` filter body for the list: the teacher scope AND the search.
 * Both are nested in one logic tree, so the search can only narrow the
 * teacher's rows and never widen them.
 */
export function buildTopicAnnouncementListOrFilter({
  q,
  scope,
}: {
  q?: string;
  scope: TopicAnnouncementAccessScope | undefined;
}) {
  const teacher =
    scope?.kind === 'teacher' ? buildTopicAnnouncementTeacherFilter(scope) : '';
  const search = q ? buildTopicAnnouncementSearchFilter(q) : '';
  if (teacher && search) return `and(or(${teacher}),or(${search}))`;
  return teacher || search || null;
}

/**
 * Loads the TEACHER group memberships of a linked workspace user, limited to
 * groups in the same workspace.
 */
export async function resolveTopicAnnouncementTeacherScope({
  publicAdmin,
  workspaceUserId,
  wsId,
}: {
  publicAdmin: TopicAnnouncementsSupabaseClient;
  workspaceUserId: string;
  wsId: string;
}): Promise<Extract<TopicAnnouncementAccessScope, { kind: 'teacher' }>> {
  const { data, error } = await publicAdmin
    .from('workspace_user_groups_users')
    .select('group_id, workspace_user_groups!inner(ws_id)')
    .eq('user_id', workspaceUserId)
    .eq('role', 'TEACHER')
    .eq('workspace_user_groups.ws_id', wsId);
  if (error) throw error;

  return {
    groupIds: [
      ...new Set<string>(
        (data ?? []).map((row: { group_id: string }) => row.group_id)
      ),
    ],
    kind: 'teacher',
    workspaceUserId,
  };
}

const NOT_FOUND = () =>
  NextResponse.json({ message: 'Not found' }, { status: 404 });

/**
 * Loads one announcement in the workspace and enforces the teacher
 * assignment. Unassigned rows answer 404 so teachers cannot probe other
 * teachers' topics.
 */
export async function loadScopedTopicAnnouncement<
  Row extends object = Record<string, unknown>,
>({
  announcementId,
  columns = '*',
  normalizedWsId,
  sbAdmin,
  scope,
}: {
  announcementId: string;
  columns?: string;
  normalizedWsId: string;
  sbAdmin: TopicAnnouncementsSupabaseClient;
  scope: TopicAnnouncementAccessScope | undefined;
}): Promise<
  | { response: Response; row?: never }
  | { response?: never; row: Row & TopicAnnouncementAssignmentRow }
> {
  const selectColumns =
    columns === '*'
      ? columns
      : [
          ...new Set([
            ...columns.split(',').map((column) => column.trim()),
            'group_id',
            'teacher_workspace_user_id',
          ]),
        ].join(',');
  const { data, error } = await sbAdmin
    .from('topic_announcements')
    .select(selectColumns)
    .eq('id', announcementId)
    .eq('ws_id', normalizedWsId)
    .maybeSingle();
  if (error) throw error;
  if (!data || !isTopicAnnouncementAssignedToScope(data, scope)) {
    return { response: NOT_FOUND() };
  }
  return { row: data as Row & TopicAnnouncementAssignmentRow };
}

/** Fields a teacher may change on a topic assigned to them. */
export const TEACHER_EDITABLE_TOPIC_FIELDS = [
  'attachmentDrafts',
  'body',
  'courseBook',
  'status',
  'topic',
  'videoUrl',
] as const;

/**
 * Validates teacher-scoped write intent. Teachers may only edit the topic
 * content (topic, body, course book, video link, attachments) and save it as a
 * draft; schedule, class, title, recipients and assignment stay with
 * supervisors (that also keeps teachers from moving their own deadline).
 */
export function validateTeacherTopicAnnouncementWrite({
  existingStatus,
  next,
  scope,
}: {
  /** Current status; a teacher may only (re)save `draft` on a draft. */
  existingStatus?: string;
  next: Record<string, unknown>;
  scope: TopicAnnouncementAccessScope | undefined;
}): { message: string; status: number } | null {
  if (!scope || scope.kind === 'manager') return null;

  const allowed = new Set<string>(TEACHER_EDITABLE_TOPIC_FIELDS);
  const forbidden = Object.entries(next)
    .filter(([key, value]) => value !== undefined && !allowed.has(key))
    .map(([key]) => key)
    .sort();
  if (forbidden.length > 0) {
    return {
      message: `Teachers cannot change: ${forbidden.join(', ')}`,
      status: 403,
    };
  }
  if (
    next.status !== undefined &&
    (next.status !== 'draft' || existingStatus !== 'draft')
  ) {
    // Moving a queued (scheduled) topic back to draft would cancel its send.
    return { message: 'Teachers can only save topic drafts', status: 403 };
  }
  return null;
}

/**
 * With teacher assignments off, write paths behave as before the feature:
 * the topic is required whenever it is written (the pre-feature schema's
 * `min(1)`), and teacher-only fields are ignored, as the old schema stripped
 * unknown keys. Returns the error response body, or the payload to write.
 */
export function gateTopicAnnouncementTeacherFields<
  Payload extends {
    courseBook?: string | null;
    teacherWorkspaceUserId?: string | null;
    topic?: string;
    videoUrl?: string | null;
  },
>(
  payload: Payload,
  { enabled, topicRequired }: { enabled: boolean; topicRequired: boolean }
):
  | { error: { issues: unknown[]; message: string }; payload?: never }
  | { error?: never; payload: Payload } {
  if (enabled) return { payload };
  const topicWritten = topicRequired || payload.topic !== undefined;
  if (topicWritten && !payload.topic?.trim()) {
    return {
      error: {
        issues: [
          {
            code: 'too_small',
            message: 'Topic is required',
            path: ['topic'],
          },
        ],
        message: 'Invalid request',
      },
    };
  }
  return {
    payload: {
      ...payload,
      courseBook: undefined,
      teacherWorkspaceUserId: undefined,
      videoUrl: undefined,
    },
  };
}
