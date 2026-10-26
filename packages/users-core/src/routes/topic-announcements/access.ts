import { NextResponse } from 'next/server';
import type { TopicAnnouncementsSupabaseClient } from './read-helpers';

/**
 * Teacher-scoped access for teacher-assigned topics.
 *
 * Supervisors keep the workspace-wide scope (`manage_users`). A teacher without
 * `manage_users` may still work on a topic when they hold the matching user
 * group post permission AND the topic is assigned to them, either directly
 * (`teacher_workspace_user_id` is their linked workspace user) or through the
 * class (`group_id` is a group where they are a TEACHER).
 */
export type TopicAnnouncementTeacherAccess =
  | 'create'
  | 'read'
  | 'send'
  | 'update';

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
  create: ['create_user_groups_posts'],
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
}: TopicAnnouncementAccessOptions & {
  hasPermission: (permission: string) => boolean;
}): TopicAnnouncementAccessMode {
  const canManage = hasPermission('manage_users');
  const managerAllowed =
    (!requireManage || canManage) &&
    (!requireSend ||
      (canManage && hasPermission('send_user_group_post_emails')));
  if (managerAllowed) return 'manager';

  if (!teacherAccess) return 'denied';
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
  if (
    row.teacher_workspace_user_id &&
    row.teacher_workspace_user_id === scope.workspaceUserId
  ) {
    return true;
  }
  return Boolean(row.group_id && scope.groupIds.includes(row.group_id));
}

/** PostgREST `or` filter limiting a list query to the teacher's topics. */
export function buildTopicAnnouncementTeacherFilter(
  scope: Extract<TopicAnnouncementAccessScope, { kind: 'teacher' }>
) {
  const filters = [`teacher_workspace_user_id.eq.${scope.workspaceUserId}`];
  if (scope.groupIds.length > 0) {
    filters.push(`group_id.in.(${scope.groupIds.join(',')})`);
  }
  return filters.join(',');
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

/**
 * Validates teacher-scoped write intent. Teachers cannot reassign a topic to
 * another teacher or move it outside their assignment, and may only save
 * drafts (sending goes through the send routes).
 */
export function validateTeacherTopicAnnouncementWrite({
  existing,
  next,
  scope,
}: {
  existing?: TopicAnnouncementAssignmentRow;
  next: {
    groupId?: string | null;
    status?: string;
    teacherWorkspaceUserId?: string | null;
  };
  scope: TopicAnnouncementAccessScope | undefined;
}): { message: string; status: number } | null {
  if (!scope || scope.kind === 'manager') return null;

  const currentTeacher = existing
    ? (existing.teacher_workspace_user_id ?? null)
    : scope.workspaceUserId;
  if (
    next.teacherWorkspaceUserId !== undefined &&
    next.teacherWorkspaceUserId !== currentTeacher
  ) {
    return { message: 'Teachers cannot reassign topics', status: 403 };
  }
  if (next.status !== undefined && next.status !== 'draft') {
    return { message: 'Teachers can only save topic drafts', status: 403 };
  }

  const groupChanged =
    next.groupId !== undefined && next.groupId !== (existing?.group_id ?? null);
  if (groupChanged && next.groupId && !scope.groupIds.includes(next.groupId)) {
    return { message: 'You do not teach this class', status: 403 };
  }

  const resulting = {
    group_id:
      next.groupId !== undefined ? next.groupId : (existing?.group_id ?? null),
    teacher_workspace_user_id: currentTeacher,
  };
  if (!isTopicAnnouncementAssignedToScope(resulting, scope)) {
    return { message: 'Topic is not assigned to you', status: 403 };
  }
  return null;
}
