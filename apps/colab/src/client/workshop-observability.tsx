import {
  ActivitySquare,
  AlertTriangle,
  CheckCircle2,
  Database,
} from '@tuturuuu/icons';
import type { RoomView } from '@tuturuuu/multiplayer';
import { Badge } from '@tuturuuu/ui/badge';
import { useCopy } from './i18n';
import { runInsights } from './run-insights';
import { Sponsorship } from './sponsorship';

export function WorkshopObservability({ room }: { room: RoomView }) {
  const c = useCopy();
  const runs = room.teams.flatMap((team) =>
    team.runs.map((run) => ({
      insight: runInsights(run, team.limits),
      run,
      team,
    }))
  );
  const issues = runs.filter(({ insight }) => insight.status !== 'complete');
  const actions = runs.reduce(
    (total, { insight }) => total + insight.usage.toolCalls,
    0
  );
  const writes = runs.reduce((total, { insight }) => total + insight.writes, 0);

  return (
    <section className="admin-subsection workshop-observability">
      <div className="observability-heading">
        <div>
          <h4>{c.workshopActivity}</h4>
          <p>{c.workshopActivityHelp}</p>
        </div>
        <Badge
          variant={issues.length || !runs.length ? 'outline' : 'secondary'}
        >
          {issues.length ? (
            <AlertTriangle className="size-3.5" aria-hidden="true" />
          ) : runs.length ? (
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
          ) : (
            <ActivitySquare className="size-3.5" aria-hidden="true" />
          )}
          {issues.length
            ? `${issues.length} ${c.toReview}`
            : runs.length
              ? c.allRunsHealthy
              : c.noRunsYet}
        </Badge>
      </div>
      <div className="observability-stat-grid">
        <div>
          <ActivitySquare className="size-4" aria-hidden="true" />
          <span>{c.practiceRuns}</span>
          <strong>{runs.length}</strong>
        </div>
        <div>
          <CheckCircle2 className="size-4" aria-hidden="true" />
          <span>{c.successfulRuns}</span>
          <strong>{runs.length - issues.length}</strong>
        </div>
        <div>
          <Database className="size-4" aria-hidden="true" />
          <span>{c.appActions}</span>
          <strong>{actions}</strong>
        </div>
        <div>
          <Database className="size-4" aria-hidden="true" />
          <span>{c.practiceChanges}</span>
          <strong>{writes}</strong>
        </div>
      </div>
      <div className="team-health-list">
        {room.teams.map((team) => {
          const latest = team.runs.at(-1);
          const latestInsight = latest
            ? runInsights(latest, team.limits)
            : null;
          return (
            <div className="team-health-row" key={team.id}>
              <span
                className="team-health-status"
                data-status={latestInsight?.status}
                role="img"
                aria-label={
                  latestInsight
                    ? latestInsight.status === 'complete'
                      ? c.allRunsHealthy
                      : c.toReview
                    : c.noRunsYet
                }
              />
              <div>
                <strong>{team.name}</strong>
                <small className="team-health-meta">
                  {latest
                    ? `${team.runs.length} ${c.practiceRuns.toLowerCase()} · ${new Date(latest.at).toLocaleString()}`
                    : c.noRunsYet}
                </small>
              </div>
              <Badge variant="outline">
                {team.aiCalls}/{team.limits.aiCallLimit} {c.aiOperationsShort}
              </Badge>
            </div>
          );
        })}
      </div>
      <Sponsorship room={room} />
    </section>
  );
}
