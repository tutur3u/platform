import 'server-only';
import { z } from 'zod';
import {
  type MeetingRecordAccess,
  MeetingRecordError,
  type MeetingRecordParams,
  meetingRecordAccess,
} from './access';
import { listLinkedProjects } from './project-links';

export type MeetingRecordItem = {
  id: string;
  kind: 'agenda' | 'decision';
  content: string;
  position: number;
  completedAt: string | null;
};

export type MeetingRecordTask = {
  id: string;
  name: string;
  done: boolean;
  dueAt: string | null;
  boardId: string | null;
  boardName: string | null;
  assignees: Array<{ id: string; displayName: string | null }>;
  linkKind: 'source' | 'carried_over';
  carriedFromMeetingId: string | null;
};

export type MeetingRecord = {
  canEdit: boolean;
  items: MeetingRecordItem[];
  tasks: MeetingRecordTask[];
  /** Board of the linked project's most recently linked task. */
  defaultBoardId: string | null;
};

const MAX_ITEMS_PER_MEETING = 200;
const content = z.string().trim().min(1).max(2000);
const createSchema = z.object({
  kind: z.enum(['agenda', 'decision']),
  content,
});
const updateSchema = z
  .object({
    id: z.uuid(),
    content: content.optional(),
    completed: z.boolean().optional(),
  })
  .refine((body) => body.content !== undefined || body.completed !== undefined);
const deleteSchema = z.object({ id: z.uuid() });

type LinkRow = {
  meeting_id: string;
  task_id: string;
  link_kind: string;
  carried_from_meeting_id: string | null;
};

type TaskRow = {
  id: string;
  name: string;
  completed_at: string | null;
  closed_at: string | null;
  deleted_at: string | null;
  end_date: string | null;
  task_lists: {
    status: string | null;
    board_id: string;
    workspace_boards: { id: string; name: string | null; ws_id: string } | null;
  } | null;
  assignees: Array<{
    user: { id: string; display_name: string | null } | null;
  }>;
};

export function toRecordTask(link: LinkRow, task: TaskRow): MeetingRecordTask {
  const status = task.task_lists?.status;
  return {
    id: task.id,
    name: task.name,
    done:
      task.completed_at !== null ||
      task.closed_at !== null ||
      status === 'done' ||
      status === 'closed',
    dueAt: task.end_date,
    boardId: task.task_lists?.board_id ?? null,
    boardName: task.task_lists?.workspace_boards?.name ?? null,
    assignees: task.assignees.flatMap(({ user }) =>
      user ? [{ id: user.id, displayName: user.display_name }] : []
    ),
    linkKind: link.link_kind === 'carried_over' ? 'carried_over' : 'source',
    carriedFromMeetingId: link.carried_from_meeting_id,
  };
}

/**
 * Tasks linked to the given meetings, read live from Tasks. Links live in
 * private, so tasks are read in a second query and kept only when they are
 * still on a board in the meeting workspace.
 */
export async function listMeetingTasks(
  db: MeetingRecordAccess['db'],
  wsId: string,
  meetingIds: string[]
) {
  const links = await db
    .schema('private')
    .from('meeting_task_links')
    .select('meeting_id, task_id, link_kind, carried_from_meeting_id')
    .eq('ws_id', wsId)
    .in('meeting_id', meetingIds)
    .order('created_at', { ascending: true })
    .limit(500);
  if (links.error)
    throw new MeetingRecordError(500, 'Meeting tasks unavailable');
  const rows = (links.data ?? []) as LinkRow[];
  if (!rows.length) return [];
  const tasks = await db
    .from('tasks')
    .select(
      `id, name, completed_at, closed_at, deleted_at, end_date,
      task_lists(status, board_id, workspace_boards(id, name, ws_id)),
      assignees:task_assignees(user:users(id, display_name))`
    )
    .in('id', [...new Set(rows.map((row) => row.task_id))])
    .is('deleted_at', null);
  if (tasks.error)
    throw new MeetingRecordError(500, 'Meeting tasks unavailable');
  const byId = new Map(
    ((tasks.data ?? []) as unknown as TaskRow[])
      .filter((task) => task.task_lists?.workspace_boards?.ws_id === wsId)
      .map((task) => [task.id, task])
  );
  return rows.flatMap((row) => {
    const task = byId.get(row.task_id);
    return task
      ? [{ meetingId: row.meeting_id, task: toRecordTask(row, task) }]
      : [];
  });
}

async function readDefaultBoard(access: MeetingRecordAccess) {
  const projects = await listLinkedProjects(access);
  if (!projects.length) return null;
  const { data, error } = await access.db
    .from('task_project_tasks')
    .select('task:tasks!inner(deleted_at, task_lists!inner(board_id))')
    .in(
      'project_id',
      projects.map((project) => project.id)
    )
    .is('task.deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  const task = data?.task as {
    task_lists: { board_id: string } | null;
  } | null;
  return task?.task_lists?.board_id ?? null;
}

export async function readMeetingRecord(
  request: Request,
  params: MeetingRecordParams
): Promise<MeetingRecord> {
  const access = await meetingRecordAccess(request, params);
  const [items, tasks, defaultBoardId] = await Promise.all([
    access.db
      .schema('private')
      .from('meeting_record_items')
      .select('id, kind, content, position, completed_at')
      .eq('meeting_id', access.meeting.id)
      .eq('ws_id', access.wsId)
      .order('kind')
      .order('position')
      .order('created_at')
      .limit(MAX_ITEMS_PER_MEETING),
    listMeetingTasks(access.db, access.wsId, [access.meeting.id]),
    readDefaultBoard(access),
  ]);
  if (items.error)
    throw new MeetingRecordError(500, 'Meeting record unavailable');
  return {
    canEdit: access.canEditRecord,
    items: (items.data ?? []).map((item) => ({
      id: item.id,
      kind: item.kind === 'decision' ? 'decision' : 'agenda',
      content: item.content,
      position: item.position,
      completedAt: item.completed_at,
    })),
    tasks: tasks.map((entry) => entry.task),
    defaultBoardId,
  };
}

async function editAccess(request: Request, params: MeetingRecordParams) {
  const access = await meetingRecordAccess(request, params, true);
  if (!access.canEditRecord)
    throw new MeetingRecordError(
      403,
      'Only the meeting host or a workspace admin can edit the record'
    );
  return access;
}

async function body<T>(request: Request, schema: z.ZodType<T>) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new MeetingRecordError(400, 'Invalid request body');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new MeetingRecordError(400, 'Invalid record item');
  return parsed.data;
}

export async function addMeetingRecordItem(
  request: Request,
  params: MeetingRecordParams
) {
  const access = await editAccess(request, params);
  const input = await body(request, createSchema);
  const { count, error: countError } = await access.db
    .schema('private')
    .from('meeting_record_items')
    .select('id', { count: 'exact', head: true })
    .eq('meeting_id', access.meeting.id);
  if (countError)
    throw new MeetingRecordError(500, 'Meeting record unavailable');
  if ((count ?? 0) >= MAX_ITEMS_PER_MEETING)
    throw new MeetingRecordError(409, 'This meeting record is full');
  const { data, error } = await access.db
    .schema('private')
    .from('meeting_record_items')
    .insert({
      meeting_id: access.meeting.id,
      ws_id: access.wsId,
      kind: input.kind,
      content: input.content,
      position: Math.min(count ?? 0, 10000),
      created_by: access.user.id,
    })
    .select('id')
    .single();
  if (error) throw new MeetingRecordError(500, 'Could not add the item');
  return { id: data.id };
}

export async function updateMeetingRecordItem(
  request: Request,
  params: MeetingRecordParams
) {
  const access = await editAccess(request, params);
  const input = await body(request, updateSchema);
  const { data, error } = await access.db
    .schema('private')
    .from('meeting_record_items')
    .update({
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(input.completed !== undefined
        ? { completed_at: input.completed ? new Date().toISOString() : null }
        : {}),
    })
    .eq('id', input.id)
    .eq('meeting_id', access.meeting.id)
    .eq('ws_id', access.wsId)
    .select('id');
  if (error) throw new MeetingRecordError(500, 'Could not update the item');
  if (!data?.length) throw new MeetingRecordError(404, 'Item not found');
  return { id: input.id };
}

export async function deleteMeetingRecordItem(
  request: Request,
  params: MeetingRecordParams
) {
  const access = await editAccess(request, params);
  const input = await body(request, deleteSchema);
  const { error } = await access.db
    .schema('private')
    .from('meeting_record_items')
    .delete()
    .eq('id', input.id)
    .eq('meeting_id', access.meeting.id)
    .eq('ws_id', access.wsId);
  if (error) throw new MeetingRecordError(500, 'Could not delete the item');
  return { id: input.id };
}
