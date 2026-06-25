import {
  type TaskProgressRouteAuth,
  withEffectiveProgressValues,
} from '../_utils';

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

      const totalsByUser = new Map<string, number>();
      for (const entry of withEffectiveProgressValues(
        entriesResult.data ?? []
      )) {
        if (!entry.created_by) continue;

        totalsByUser.set(
          entry.created_by,
          (totalsByUser.get(entry.created_by) ?? 0) +
            Number(entry.effectiveValue ?? 0)
        );
      }

      const rankings = (membersResult.data ?? [])
        .map((member: Record<string, any>) => ({
          ...member,
          value: totalsByUser.get(member.user_id) ?? 0,
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

      return {
        ...leaderboard,
        members: membersResult.data ?? [],
        teams: teamsResult.data ?? [],
        rankings,
        teamTotals,
      };
    })
  );
}
