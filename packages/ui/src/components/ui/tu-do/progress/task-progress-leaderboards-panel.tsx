import type { UseMutationResult } from '@tanstack/react-query';
import { Sparkles, Trophy } from '@tuturuuu/icons';
import type { TaskProgressMetric } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import type { useTranslations } from 'next-intl';

type Translate = ReturnType<typeof useTranslations>;
const today = () => new Date().toISOString().slice(0, 10);

function MetricSelect({
  metrics,
  selectedMetric,
}: {
  metrics: TaskProgressMetric[];
  selectedMetric: TaskProgressMetric | null;
}) {
  return (
    <select
      className="h-11 w-full rounded-xl border bg-background px-3 text-sm shadow-sm outline-none focus:border-dynamic-blue focus:ring-2 focus:ring-dynamic-blue/15"
      defaultValue={selectedMetric?.id}
      name="metric_id"
      required
    >
      {metrics.map((metric) => (
        <option key={metric.id} value={metric.id}>
          {metric.name}
        </option>
      ))}
    </select>
  );
}

export function LeaderboardsPanel(props: {
  createLeaderboardMutation: UseMutationResult<any, unknown, FormData>;
  createTeamMutation: UseMutationResult<
    any,
    unknown,
    { formData: FormData; leaderboardId: string }
  >;
  leaderboards: any[];
  metrics: TaskProgressMetric[];
  selectedMetric: TaskProgressMetric | null;
  t: Translate;
}) {
  const {
    createLeaderboardMutation,
    createTeamMutation,
    leaderboards,
    metrics,
    selectedMetric,
    t,
  } = props;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)]">
      <Card className="order-2 h-fit xl:sticky xl:top-6">
        <CardHeader>
          <CardTitle>{t('leaderboards.custom_leaderboard')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              createLeaderboardMutation.mutate(
                new FormData(event.currentTarget)
              );
              event.currentTarget.reset();
            }}
          >
            <Input
              name="name"
              placeholder={t('fields.leaderboard_name')}
              required
            />
            <MetricSelect metrics={metrics} selectedMetric={selectedMetric} />
            <Input defaultValue={today()} name="period_start" type="date" />
            <Input name="period_end" type="date" />
            <Button
              disabled={!selectedMetric || createLeaderboardMutation.isPending}
            >
              <Trophy className="mr-2 h-4 w-4" />
              {t('actions.add_leaderboard')}
            </Button>
          </form>
        </CardContent>
      </Card>
      <div className="order-1 grid gap-3">
        {leaderboards.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-sm">
              {t('empty.leaderboards')}
            </CardContent>
          </Card>
        ) : (
          leaderboards.map((leaderboard) => (
            <Card key={leaderboard.id}>
              <CardContent className="space-y-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 font-semibold">
                      {leaderboard.automatic
                        ? t('leaderboards.automatic_name')
                        : leaderboard.name}
                      {leaderboard.automatic ? (
                        <Badge className="gap-1" variant="secondary">
                          <Sparkles className="size-3" />
                          {t('autopilot.badge')}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="text-muted-foreground text-sm">
                      {leaderboard.automatic
                        ? t('leaderboards.automatic_description')
                        : leaderboard.description || leaderboard.metric?.name}
                    </div>
                  </div>
                  <Badge>{leaderboard.rankings?.length ?? 0}</Badge>
                </div>
                <div className="space-y-2">
                  {(leaderboard.rankings ?? [])
                    .slice(0, 5)
                    .map((member: any) => (
                      <div
                        className="flex items-center justify-between rounded-md border p-2"
                        key={member.id}
                      >
                        <span>
                          #{member.rank} {member.display_name || member.user_id}
                        </span>
                        <strong>
                          {Number(member.value ?? 0).toLocaleString()}
                        </strong>
                      </div>
                    ))}
                </div>
                {!leaderboard.automatic ? (
                  <form
                    className="grid gap-2 border-t pt-3 sm:grid-cols-[1fr_7rem_auto]"
                    onSubmit={(event) => {
                      event.preventDefault();
                      createTeamMutation.mutate({
                        formData: new FormData(event.currentTarget),
                        leaderboardId: leaderboard.id,
                      });
                      event.currentTarget.reset();
                    }}
                  >
                    <Input
                      name="name"
                      placeholder={t('fields.team_name')}
                      required
                    />
                    <Input name="color" placeholder={t('fields.color')} />
                    <Button size="sm" variant="outline">
                      {t('actions.add_team')}
                    </Button>
                  </form>
                ) : null}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
