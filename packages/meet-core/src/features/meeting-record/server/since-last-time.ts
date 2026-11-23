import 'server-only';
import { z } from 'zod';
import {
  type MeetingRecordAccess,
  MeetingRecordError,
  type MeetingRecordParams,
  meetingRecordAccess,
} from './access';
import { listLinkedProjects } from './project-links';
import { listMeetingTasks, type MeetingRecordTask } from './record';

const MAX_EARLIER_MEETINGS = 20;
const MAX_CARRY = 100;

export type SinceLastTimeTask = MeetingRecordTask & { fromMeetingId: string };

export type SinceLastTime = {
  /** The most recent earlier meeting in the same Project, if any. */
  previousMeeting: { id: string; name: string; time: string } | null;
  open: SinceLastTimeTask[];
  /** Done since the previous meeting started. */
  resolved: SinceLastTimeTask[];
  canCarry: boolean;
};

const carrySchema = z.object({
  taskIds: z.array(z.uuid()).min(1).max(MAX_CARRY),
});

/** Earlier meetings that share a Project with this one, newest first. */
async function earlierProjectMeetings(access: MeetingRecordAccess) {
  const projects = await listLinkedProjects(access);
  if (!projects.length) return [];
  const links = await access.db
    .schema('private')
    .from('task_project_links')
    .select('entity_id')
    .eq('ws_id', access.wsId)
    .eq('entity_kind', 'meeting')
    .in(
      'project_id',
      projects.map((project) => project.id)
    )
    .neq('entity_id', access.meeting.id)
    .limit(500);
  if (links.error)
    throw new MeetingRecordError(500, 'Earlier meetings unavailable');
  const ids = [...new Set((links.data ?? []).map((link) => link.entity_id))];
  if (!ids.length) return [];
  const meetings = await access.db
    .from('workspace_meetings')
    .select('id, name, time')
    .eq('ws_id', access.wsId)
    .in('id', ids)
    .lt('time', access.meeting.time)
    .order('time', { ascending: false })
    .limit(MAX_EARLIER_MEETINGS);
  if (meetings.error)
    throw new MeetingRecordError(500, 'Earlier meetings unavailable');
  return meetings.data ?? [];
}

async function collect(access: MeetingRecordAccess) {
  const earlier = await earlierProjectMeetings(access);
  const previous = earlier[0] ?? null;
  if (!previous) return { previous, open: [], resolved: [] };
  const [earlierTasks, current] = await Promise.all([
    listMeetingTasks(
      access.db,
      access.wsId,
      earlier.map((meeting) => meeting.id)
    ),
    listMeetingTasks(access.db, access.wsId, [access.meeting.id]),
  ]);
  const here = new Set(current.map((entry) => entry.task.id));
  // The newest earlier meeting that lists a task is where it carries from.
  const order = new Map(earlier.map((meeting, index) => [meeting.id, index]));
  const byTask = new Map<string, SinceLastTimeTask>();
  for (const { meetingId, task } of earlierTasks) {
    if (here.has(task.id)) continue;
    const seen = byTask.get(task.id);
    if (
      !seen ||
      (order.get(meetingId) ?? Infinity) <
        (order.get(seen.fromMeetingId) ?? Infinity)
    )
      byTask.set(task.id, { ...task, fromMeetingId: meetingId });
  }
  const all = [...byTask.values()];
  const since = Date.parse(previous.time);
  return {
    previous,
    open: all.filter((task) => !task.done),
    resolved: all.filter(
      (task) => task.done && (!task.doneAt || Date.parse(task.doneAt) >= since)
    ),
  };
}

export async function readSinceLastTime(
  request: Request,
  params: MeetingRecordParams
): Promise<SinceLastTime> {
  const access = await meetingRecordAccess(request, params);
  const { previous, open, resolved } = await collect(access);
  return {
    previousMeeting: previous,
    open,
    resolved,
    canCarry: access.canEditRecord,
  };
}

/**
 * Carries open items from earlier meetings to this one. Only tasks that are
 * still open on an earlier meeting in the same Project are carried; each
 * names the earlier meeting it came from.
 */
export async function carryOverItems(
  request: Request,
  params: MeetingRecordParams
) {
  const access = await meetingRecordAccess(request, params, true);
  if (!access.canEditRecord)
    throw new MeetingRecordError(
      403,
      'Only the meeting host or a workspace admin can carry items over'
    );
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new MeetingRecordError(400, 'Invalid request body');
  }
  const parsed = carrySchema.safeParse(body);
  if (!parsed.success) throw new MeetingRecordError(400, 'Invalid items');
  const { open } = await collect(access);
  const requested = new Set(parsed.data.taskIds);
  const rows = open
    .filter((task) => requested.has(task.id))
    .map((task) => ({
      meeting_id: access.meeting.id,
      task_id: task.id,
      ws_id: access.wsId,
      link_kind: 'carried_over',
      carried_from_meeting_id: task.fromMeetingId,
      created_by: access.user.id,
    }));
  if (!rows.length) return { carried: 0 };
  const { error } = await access.db
    .schema('private')
    .from('meeting_task_links')
    .upsert(rows, {
      onConflict: 'meeting_id,task_id',
      ignoreDuplicates: true,
    });
  if (error?.code === '23503')
    throw new MeetingRecordError(404, 'Meeting not found');
  if (error) throw new MeetingRecordError(500, 'Could not carry items over');
  return { carried: rows.length };
}
