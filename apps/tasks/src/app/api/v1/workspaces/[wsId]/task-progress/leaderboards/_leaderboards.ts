import { resolveCoMemberDisplayNames } from '@/lib/co-member-display-names';
import {
  isAutonomousTaskMetric,
  loadAutonomousTaskProgressEntries,
} from '../_autonomous';
import {
  type TaskProgressRouteAuth,
  withEffectiveProgressValues,
} from '../_utils';

const DAY_MS = 86_400_000;
const SPARKLINE_DAYS = 7;

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** Trailing 7 ISO dates ending at `end` (capped to today). */
function sparklineDates(periodEnd: string | null): string[] {
  const today = formatDate(new Date());
  const end = periodEnd && periodEnd < today ? periodEnd : today;
  const endDate = new Date(`${end}T00:00:00.000Z`);
  return Array.from({ length: SPARKLINE_DAYS }, (_, index) =>
    formatDate(
      new Date(endDate.getTime() - (SPARKLINE_DAYS - 1 - index) * DAY_MS)
    )
  );
}

/**
 * Names for leaderboard members without a leaderboard alias: the profile
 * display name, else (D246) the email of a co-member, else the handle.
 * Resolved for the viewer on the server; only the name string is returned.
 */
export async function resolveLeaderboardMemberNames(
  auth: TaskProgressRouteAuth,
  userIds: readonly string[]
): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return new Map();

  const { data: users, error } = await (auth.sbAdmin as any)
    .from('users')
    .select('id, display_name, handle')
    .in('id', ids);
  // Names are cosmetic: a failed lookup keeps the stored names.
  if (error) return new Map();

  const profiles = new Map<
    string,
    { display_name?: string | null; handle?: string | null }
  >(
    (users ?? []).map(
      (user: {
        id: string;
        display_name?: string | null;
        handle?: string | null;
      }) => [user.id, user]
    )
  );
  return resolveCoMemberDisplayNames({
    admin: auth.sbAdmin,
    wsId: auth.wsId,
    viewerUserId: auth.user.id,
    users: ids.map((id) => ({
      id,
      display_name: profiles.get(id)?.display_name ?? null,
      handle: profiles.get(id)?.handle ?? null,
    })),
  });
}

function withMemberName(
  member: Record<string, any>,
  names: ReadonlyMap<string, string>
) {
  if (typeof member.display_name === 'string' && member.display_name.trim()) {
    return member;
  }
  const name = names.get(member.user_id);
  return name ? { ...member, display_name: name } : member;
}

export async function hydrateLeaderboards(
  auth: TaskProgressRouteAuth,
  leaderboards: Record<string, any>[]
) {
  if (leaderboards.length === 0) return leaderboards;

  return Promise.all(
    leaderboards.map(async (leaderboard) => {
      const [membersResult, teamsResult, entriesResult] = await Promise.all([
        (auth.sbAdmin as any)
          .from('task_leaderboard_members')
          .select('id, leaderboard_id, team_id, user_id, display_name, status')
          .eq('leaderboard_id', leaderboard.id)
          .eq('status', 'active'),
        (auth.sbAdmin as any)
          .from('task_leaderboard_teams')
          .select('id, leaderboard_id, name, color')
          .eq('leaderboard_id', leaderboard.id),
        (auth.sbAdmin as any)
          .from('task_progress_entries')
          .select(
            `
              id,
              metric_id,
              task_id,
              project_id,
              board_id,
              list_id,
              created_by,
              created_at,
              value,
              mode,
              entry_date
            `
          )
          .eq('ws_id', auth.wsId)
          .eq('metric_id', leaderboard.metric_id)
          .is('deleted_at', null)
          .gte('entry_date', leaderboard.period_start)
          .lte('entry_date', leaderboard.period_end ?? '9999-12-31'),
      ]);

      for (const result of [membersResult, teamsResult, entriesResult]) {
        if (result.error) throw result.error;
      }

      const rawMembers: Record<string, any>[] = membersResult.data ?? [];
      const memberNames = await resolveLeaderboardMemberNames(
        auth,
        rawMembers
          .filter(
            (member) =>
              !(
                typeof member.display_name === 'string' &&
                member.display_name.trim()
              )
          )
          .map((member) => member.user_id)
      );
      const members = rawMembers.map((member) =>
        withMemberName(member, memberNames)
      );

      const progressEntries =
        leaderboard.metric && isAutonomousTaskMetric(leaderboard.metric)
          ? await loadAutonomousTaskProgressEntries(auth, leaderboard.metric, {
              from: leaderboard.period_start,
              to: leaderboard.period_end,
            })
          : withEffectiveProgressValues(entriesResult.data ?? []);
      const totalsByUser = new Map<string, number>();
      // Per-user daily totals keyed by "userId|date" for sparklines.
      const dailyByUser = new Map<string, number>();
      for (const entry of progressEntries) {
        if (!entry.created_by) continue;

        const value = Number(entry.effectiveValue ?? 0);
        totalsByUser.set(
          entry.created_by,
          (totalsByUser.get(entry.created_by) ?? 0) + value
        );
        if (entry.entry_date) {
          const key = `${entry.created_by}|${entry.entry_date}`;
          dailyByUser.set(key, (dailyByUser.get(key) ?? 0) + value);
        }
      }

      const sparkDates = sparklineDates(leaderboard.period_end ?? null);

      const rankings = members
        .map((member: Record<string, any>) => ({
          ...member,
          value: totalsByUser.get(member.user_id) ?? 0,
          sparkline: sparkDates.map(
            (date) => dailyByUser.get(`${member.user_id}|${date}`) ?? 0
          ),
          team: (teamsResult.data ?? []).find(
            (team: Record<string, any>) => team.id === member.team_id
          ),
        }))
        .sort((a: Record<string, any>, b: Record<string, any>) => {
          const valueDelta = Number(b.value ?? 0) - Number(a.value ?? 0);
          if (valueDelta !== 0) return valueDelta;
          return String(a.display_name ?? a.user_id).localeCompare(
            String(b.display_name ?? b.user_id)
          );
        })
        .map((member: Record<string, any>, index: number) => ({
          ...member,
          rank: index + 1,
        }));

      const teamTotals = (teamsResult.data ?? [])
        .map((team: Record<string, any>) => ({
          ...team,
          value: rankings
            .filter((member: Record<string, any>) => member.team_id === team.id)
            .reduce(
              (total: number, member: Record<string, any>) =>
                total + Number(member.value ?? 0),
              0
            ),
        }))
        .sort(
          (a: Record<string, any>, b: Record<string, any>) =>
            Number(b.value ?? 0) - Number(a.value ?? 0)
        );

      const joined = members.some(
        (member: Record<string, any>) => member.user_id === auth.user.id
      );

      return {
        ...leaderboard,
        members,
        teams: teamsResult.data ?? [],
        rankings,
        teamTotals,
        joined,
      };
    })
  );
}
