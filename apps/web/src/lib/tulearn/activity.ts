import { getAssignedCourseIds } from './courses';
import { getAdmin } from './db';
import { firstOf } from './helpers';
import type { Db } from './types';

interface NamedGroup {
  id: string;
  name: string;
}

interface UserGroupPostRow {
  id: string;
  title: string | null;
  content: string | null;
  created_at: string;
  group_id: string;
  workspace_user_groups: NamedGroup | NamedGroup[] | null;
}

interface MonthlyReportRow {
  id: string;
  title: string;
  content: string;
  feedback: string | null;
  score: number | null;
  created_at: string;
  group_id: string;
  group_name: string | null;
}

interface MetricRow {
  indicator_id: string;
  value: number | null;
  created_at: string | null;
  user_group_metrics:
    | {
        id: string;
        name: string;
        unit: string | null;
        workspace_user_groups: NamedGroup | NamedGroup[] | null;
      }
    | {
        id: string;
        name: string;
        unit: string | null;
        workspace_user_groups: NamedGroup | NamedGroup[] | null;
      }[]
    | null;
}

export async function getLearnerAssignments({
  db,
  studentWorkspaceUserId,
  wsId,
}: {
  db?: Db;
  studentWorkspaceUserId: string;
  wsId: string;
}) {
  const sbAdmin = await getAdmin(db);
  const courseIds = await getAssignedCourseIds({
    db: sbAdmin,
    studentWorkspaceUserId,
    wsId,
  });
  if (!courseIds.length) return [];

  const [postsResult, checksResult] = await Promise.all([
    sbAdmin
      .schema('private')
      .from('user_group_posts')
      .select(
        'id, title, content, created_at, group_id, workspace_user_groups!inner(id, name, ws_id)'
      )
      .in('group_id', courseIds)
      .eq('workspace_user_groups.ws_id', wsId)
      .order('created_at', { ascending: false })
      .limit(12),
    sbAdmin
      .schema('private')
      .from('user_group_post_checks')
      .select('post_id, is_completed, approval_status')
      .eq('user_id', studentWorkspaceUserId),
  ]);

  if (postsResult.error) throw postsResult.error;
  if (checksResult.error) throw checksResult.error;

  const checksByPost = new Map(
    (checksResult.data ?? []).map((check) => [check.post_id, check])
  );

  const rows = (postsResult.data ?? []) as unknown as UserGroupPostRow[];
  return rows.map((post) => {
    const course = firstOf(post.workspace_user_groups);
    const check = checksByPost.get(post.id);
    return {
      id: post.id,
      title: post.title ?? null,
      content: post.content ?? null,
      created_at: post.created_at,
      course: {
        id: post.group_id,
        name: course?.name ?? null,
      },
      is_completed: Boolean(check?.is_completed),
      approval_status: check?.approval_status ?? null,
    };
  });
}

export async function getLearnerReports({
  db,
  studentWorkspaceUserId,
  wsId,
}: {
  db?: Db;
  studentWorkspaceUserId: string;
  wsId: string;
}) {
  const sbAdmin = await getAdmin(db);
  const courseIds = await getAssignedCourseIds({
    db: sbAdmin,
    studentWorkspaceUserId,
    wsId,
  });
  if (!courseIds.length) return [];
  const privateDb = sbAdmin.schema('private');

  const { data, error } = await privateDb
    .from('external_user_monthly_reports_workspace_view')
    .select(
      'id, title, content, feedback, score, created_at, group_id, group_name'
    )
    .eq('user_id', studentWorkspaceUserId)
    .in('group_id', courseIds)
    .eq('user_ws_id', wsId)
    .order('created_at', { ascending: false })
    .limit(12);

  if (error) throw error;

  const rows = (data ?? []) as unknown as MonthlyReportRow[];
  return rows.map((report) => {
    return {
      id: report.id,
      title: report.title,
      content: report.content,
      feedback: report.feedback ?? null,
      score: report.score ?? null,
      created_at: report.created_at,
      course: report.group_name
        ? {
            id: report.group_id,
            name: report.group_name,
          }
        : null,
    };
  });
}

export async function getLearnerMarks({
  db,
  studentWorkspaceUserId,
  wsId,
}: {
  db?: Db;
  studentWorkspaceUserId: string;
  wsId: string;
}) {
  const sbAdmin = await getAdmin(db);
  const courseIds = await getAssignedCourseIds({
    db: sbAdmin,
    studentWorkspaceUserId,
    wsId,
  });
  if (!courseIds.length) return [];

  const { data, error } = await sbAdmin
    .from('user_indicators')
    .select(
      'indicator_id, value, created_at, user_group_metrics!inner(id, name, unit, group_id, ws_id, workspace_user_groups(id, name))'
    )
    .eq('user_id', studentWorkspaceUserId)
    .eq('user_group_metrics.ws_id', wsId)
    .in('user_group_metrics.group_id', courseIds)
    .order('created_at', { ascending: false })
    .limit(24);

  if (error) throw error;

  const rows = (data ?? []) as MetricRow[];
  return rows.map((mark) => {
    const metric = firstOf(mark.user_group_metrics);
    const course = firstOf(metric?.workspace_user_groups);
    return {
      id: `${mark.indicator_id}:${studentWorkspaceUserId}`,
      value: mark.value ?? null,
      created_at: mark.created_at ?? null,
      metric: {
        id: metric?.id ?? mark.indicator_id,
        name: metric?.name ?? null,
        unit: metric?.unit ?? null,
      },
      course: course
        ? {
            id: course.id,
            name: course.name,
          }
        : null,
    };
  });
}
