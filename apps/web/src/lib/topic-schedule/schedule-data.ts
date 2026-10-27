import {
  getPublicSchemaClient,
  type TopicAnnouncementsSupabaseClient,
} from '@tuturuuu/users-core/routes/topic-announcements';
import {
  isGvnnContactTags,
  normalizeScheduleTime,
  pickPrimaryGroupTeacher,
  type ScheduleClass,
  type ScheduleGvnnContact,
  type ScheduleSession,
  scheduleDurationMinutes,
  scheduleMonthRange,
  TOPIC_SCHEDULE_GVCN_ROLE,
} from '@tuturuuu/utils/topic-schedule';
import { chunkArray } from '@/lib/post-email-queue/utils';

/** `source_type` of announcements created by the schedule editor. */
export const SCHEDULE_SOURCE_TYPE = 'schedule';
/** Upper bound on sessions read for one month. */
export const SCHEDULE_MONTH_SESSION_LIMIT = 1000;
/**
 * Statuses the editor may change. Queued, processing and sent sessions are in
 * delivery; cancelled ones were removed. Writes re-check this in the database.
 */
export const SCHEDULE_EDITABLE_STATUSES = [
  'draft',
  'failed',
  'skipped',
] as const;

export function isScheduleSessionEditable(status: string) {
  return (SCHEDULE_EDITABLE_STATUSES as readonly string[]).includes(status);
}

const SESSION_COLUMNS =
  'id,group_id,class_label,session_date,start_time,end_time,room,place,status,topic,sent_at,teacher_workspace_user_id';

type Row = Record<string, any>;

export interface ScheduleGvnnContactOption extends ScheduleGvnnContact {
  /** Tagged GVNN; untagged contacts appear only because a session uses them. */
  isGvnn: boolean;
}

export interface ScheduleMonthData {
  classes: ScheduleClass[];
  gvnnContacts: ScheduleGvnnContactOption[];
  sessions: ScheduleSession[];
}

function teacherName(user: Row | undefined) {
  return (
    user?.full_name?.trim() ||
    user?.display_name?.trim() ||
    user?.email?.trim() ||
    ''
  );
}

/** Active classes of the workspace with their TEACHER members (GVCN). */
export async function loadScheduleClasses({
  normalizedWsId,
  sbAdmin,
}: {
  normalizedWsId: string;
  sbAdmin: TopicAnnouncementsSupabaseClient;
}): Promise<ScheduleClass[]> {
  const publicAdmin = getPublicSchemaClient(sbAdmin);
  const { data: groups, error: groupsError } = await publicAdmin
    .from('workspace_user_groups')
    .select('id,name')
    .eq('ws_id', normalizedWsId)
    .or('archived.is.null,archived.eq.false')
    .order('name')
    .range(0, 4999);
  if (groupsError) throw groupsError;

  const { data: members, error: membersError } = await publicAdmin
    .from('workspace_user_groups_users')
    .select('group_id,user_id,created_at,workspace_user_groups!inner(ws_id)')
    .eq('workspace_user_groups.ws_id', normalizedWsId)
    .eq('role', TOPIC_SCHEDULE_GVCN_ROLE)
    .range(0, 9999);
  if (membersError) throw membersError;

  const teacherIds = [
    ...new Set((members ?? []).map((member: Row) => member.user_id)),
  ];
  const usersById = new Map<string, Row>();
  if (teacherIds.length > 0) {
    const { data: users, error: usersError } = await publicAdmin
      .from('workspace_users')
      .select('id,full_name,display_name,email')
      .eq('ws_id', normalizedWsId)
      .in('id', teacherIds);
    if (usersError) throw usersError;
    for (const user of users ?? []) usersById.set(user.id, user);
  }

  const membersByGroup = new Map<string, Row[]>();
  for (const member of members ?? []) {
    // Only workspace users of this workspace can be a GVCN.
    if (!usersById.has(member.user_id)) continue;
    const list = membersByGroup.get(member.group_id) ?? [];
    list.push(member);
    membersByGroup.set(member.group_id, list);
  }

  return (groups ?? []).map((group: Row) => {
    const groupMembers = membersByGroup.get(group.id) ?? [];
    return {
      id: group.id,
      name: group.name?.trim() || group.id,
      primaryTeacherId: pickPrimaryGroupTeacher(
        groupMembers.map((member) => ({
          createdAt: member.created_at ?? null,
          userId: member.user_id,
        }))
      ),
      teachers: groupMembers.map((member) => ({
        id: member.user_id,
        name: teacherName(usersById.get(member.user_id)),
      })),
    };
  });
}

/** Non-cancelled schedule sessions dated within the month. */
export async function loadScheduleSessions({
  month,
  normalizedWsId,
  sbAdmin,
  status = 'active',
}: {
  month: string;
  normalizedWsId: string;
  sbAdmin: TopicAnnouncementsSupabaseClient;
  /** `active` (default): everything but cancelled; `cancelled`: only those. */
  status?: 'active' | 'cancelled';
}): Promise<ScheduleSession[]> {
  const { end, start } = scheduleMonthRange(month);
  const query = sbAdmin
    .from('topic_announcements')
    .select(SESSION_COLUMNS)
    .eq('ws_id', normalizedWsId)
    .eq('source_type', SCHEDULE_SOURCE_TYPE);
  const { data: rows, error } = await (status === 'cancelled'
    ? query.eq('status', 'cancelled')
    : query.neq('status', 'cancelled')
  )
    .gte('session_date', start)
    .lte('session_date', end)
    .order('session_date')
    .order('start_time')
    .range(0, SCHEDULE_MONTH_SESSION_LIMIT - 1);
  if (error) throw error;

  const ids = (rows ?? []).map((row: Row) => row.id);
  const gvnnByAnnouncement = new Map<string, string>();
  // Chunked so a full month never builds one oversized `in()` filter.
  for (const chunk of chunkArray(ids)) {
    const { data: recipients, error: recipientsError } = await sbAdmin
      .from('topic_announcement_recipients')
      .select('announcement_id,contact_id')
      .in('announcement_id', chunk);
    if (recipientsError) throw recipientsError;
    for (const recipient of recipients ?? []) {
      gvnnByAnnouncement.set(recipient.announcement_id, recipient.contact_id);
    }
  }

  return (rows ?? []).map((row: Row) => {
    const startTime = normalizeScheduleTime(row.start_time) ?? '00:00';
    const endTime = normalizeScheduleTime(row.end_time);
    return {
      classLabel: row.class_label ?? null,
      durationMinutes: scheduleDurationMinutes(startTime, endTime),
      endTime,
      groupId: row.group_id ?? null,
      gvnnContactId: gvnnByAnnouncement.get(row.id) ?? null,
      hasTopic: Boolean(row.topic?.trim()),
      id: row.id,
      place: row.place ?? null,
      room: row.room ?? null,
      sentAt: row.sent_at ?? null,
      sessionDate: row.session_date,
      startTime,
      status: row.status,
      teacherWorkspaceUserId: row.teacher_workspace_user_id ?? null,
    };
  });
}

/**
 * Active contacts usable as GVNN: those tagged GVNN, plus any contact a
 * session already references so its name still shows.
 */
export async function loadScheduleContacts({
  normalizedWsId,
  referencedIds = [],
  sbAdmin,
}: {
  normalizedWsId: string;
  referencedIds?: readonly (string | null)[];
  sbAdmin: TopicAnnouncementsSupabaseClient;
}): Promise<ScheduleGvnnContactOption[]> {
  const { data, error } = await sbAdmin
    .from('topic_announcement_contacts')
    .select('id,name,email,tags')
    .eq('ws_id', normalizedWsId)
    .eq('archived', false)
    .order('name')
    .range(0, 4999);
  if (error) throw error;

  const referenced = new Set(referencedIds.filter(Boolean));
  return (data ?? [])
    .map((contact: Row) => ({
      email: contact.email,
      id: contact.id,
      isGvnn: isGvnnContactTags(contact.tags),
      name: contact.name?.trim() || contact.email,
    }))
    .filter(
      (contact: ScheduleGvnnContactOption) =>
        contact.isGvnn || referenced.has(contact.id)
    );
}

export async function loadScheduleMonth(input: {
  month: string;
  normalizedWsId: string;
  sbAdmin: TopicAnnouncementsSupabaseClient;
}): Promise<ScheduleMonthData> {
  const [classes, sessions] = await Promise.all([
    loadScheduleClasses(input),
    loadScheduleSessions(input),
  ]);
  const gvnnContacts = await loadScheduleContacts({
    ...input,
    referencedIds: sessions.map((session) => session.gvnnContactId),
  });
  return { classes, gvnnContacts, sessions };
}
