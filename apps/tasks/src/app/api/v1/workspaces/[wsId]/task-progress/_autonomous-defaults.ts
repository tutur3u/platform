import type {
  TaskLeaderboard,
  TaskProgressGoal,
  TaskProgressMetric,
} from '@tuturuuu/tasks-api';
import { loadAutonomousTaskProgressEntries } from './_autonomous';
import type { TaskProgressRouteAuth } from './_utils';

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function currentWeek() {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const weekday = start.getUTCDay() || 7;
  start.setUTCDate(start.getUTCDate() - weekday + 1);
  return { start: formatDate(start), end: formatDate(addDays(start, 6)) };
}

export async function buildAutonomousWeeklyGoal(
  auth: TaskProgressRouteAuth,
  metric: TaskProgressMetric,
  style: 'sustainable' | 'adaptive' | 'ambitious' = 'adaptive'
): Promise<TaskProgressGoal> {
  const week = currentWeek();
  const historyStart = formatDate(
    addDays(new Date(`${week.start}T00:00:00Z`), -28)
  );
  const entries = await loadAutonomousTaskProgressEntries(auth, metric, {
    from: historyStart,
    to: week.end,
  });
  const personalEntries = entries.filter(
    (entry) => entry.created_by === auth.user.id
  );
  const progress = personalEntries
    .filter((entry) => entry.entry_date >= week.start)
    .reduce((total, entry) => total + entry.effectiveValue, 0);
  const previousTotal = personalEntries
    .filter((entry) => entry.entry_date < week.start)
    .reduce((total, entry) => total + entry.effectiveValue, 0);
  const goalProfile = {
    sustainable: { minimum: 3, multiplier: 1 },
    adaptive: { minimum: 5, multiplier: 1.1 },
    ambitious: { minimum: 7, multiplier: 1.25 },
  }[style];
  const target = Math.max(
    goalProfile.minimum,
    Math.ceil((previousTotal / 4) * goalProfile.multiplier)
  );
  const today = new Date();
  const weekStart = new Date(`${week.start}T00:00:00.000Z`);
  const elapsedDays = Math.max(
    1,
    Math.min(
      7,
      Math.floor((today.getTime() - weekStart.getTime()) / 86_400_000) + 1
    )
  );
  const expectedProgress = (target * elapsedDays) / 7;
  const projectedTotal = (progress / elapsedDays) * 7;

  return {
    archived_at: null,
    automatic: true,
    board_id: null,
    created_at: `${week.start}T00:00:00.000Z`,
    description: 'Adapts automatically to your recent task completion pace.',
    expected_progress: expectedProgress,
    goal_type: 'target',
    id: `autonomous-weekly-goal:${auth.user.id}:${week.start}`,
    metric,
    metric_id: metric.id,
    name: 'Weekly task momentum',
    owner_id: auth.user.id,
    percent: Math.min((progress / target) * 100, 100),
    pace_delta: progress - expectedProgress,
    projected_total: projectedTotal,
    on_track: progress >= expectedProgress,
    period_end: week.end,
    period_start: week.start,
    progress,
    project_id: null,
    recurrence: 'weekly',
    remaining: Math.max(target - progress, 0),
    starred: true,
    status: 'active',
    tags: ['automatic', 'weekly'],
    target_value: target,
    task_id: null,
    updated_at: new Date().toISOString(),
    visibility: 'private',
    ws_id: auth.wsId,
  };
}

export async function buildAutonomousWeeklyLeaderboard(
  auth: TaskProgressRouteAuth,
  metric: TaskProgressMetric
): Promise<TaskLeaderboard> {
  const week = currentWeek();
  const [entries, membersResult] = await Promise.all([
    loadAutonomousTaskProgressEntries(auth, metric, {
      from: week.start,
      to: week.end,
    }),
    (auth.sbAdmin as any)
      .from('workspace_members')
      .select('user_id')
      .eq('ws_id', auth.wsId),
  ]);
  if (membersResult.error) throw membersResult.error;

  const userIds = Array.from(
    new Set<string>([
      auth.user.id,
      ...(membersResult.data ?? [])
        .map((member: { user_id?: string | null }) => member.user_id)
        .filter((userId: string | null | undefined): userId is string =>
          Boolean(userId)
        ),
    ])
  );
  const { data: users, error: usersError } = userIds.length
    ? await (auth.sbAdmin as any)
        .from('users')
        .select('id, display_name')
        .in('id', userIds)
    : { data: [], error: null };
  if (usersError) throw usersError;

  const names = new Map<string, string | null>(
    (users ?? []).map((user: { display_name?: string | null; id: string }) => [
      user.id,
      user.display_name ?? null,
    ])
  );
  const totals = new Map<string, number>();
  for (const entry of entries) {
    if (!entry.created_by) continue;
    totals.set(
      entry.created_by,
      (totals.get(entry.created_by) ?? 0) + entry.effectiveValue
    );
  }

  const rankings = userIds
    .map((userId) => ({
      display_name: names.get(userId) ?? null,
      id: `autonomous-member:${userId}`,
      leaderboard_id: `autonomous-weekly-leaderboard:${week.start}`,
      status: 'active' as const,
      team_id: null,
      user_id: userId,
      value: totals.get(userId) ?? 0,
    }))
    .sort((a, b) => b.value - a.value)
    .map((member, index) => ({ ...member, rank: index + 1 }));

  return {
    archived_at: null,
    automatic: true,
    created_at: `${week.start}T00:00:00.000Z`,
    created_by: auth.user.id,
    description: 'Updates from completed tasks across this workspace.',
    id: `autonomous-weekly-leaderboard:${week.start}`,
    join_code: '',
    members: rankings,
    metric,
    metric_id: metric.id,
    name: 'This week',
    period_end: week.end,
    period_start: week.start,
    rankings,
    starred: true,
    status: 'active',
    teamTotals: [],
    teams: [],
    updated_at: new Date().toISOString(),
    visibility: 'workspace',
    ws_id: auth.wsId,
  };
}
