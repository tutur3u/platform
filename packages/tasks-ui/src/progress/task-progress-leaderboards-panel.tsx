import { type UseMutationResult, useMutation } from '@tanstack/react-query';
import {
  Copy,
  Crown,
  LogOut,
  Medal,
  Sparkles,
  Trophy,
  Users,
} from '@tuturuuu/icons';
import {
  joinTaskLeaderboard,
  leaveTaskLeaderboard,
  type TaskLeaderboard,
  type TaskLeaderboardMember,
  type TaskProgressMetric,
} from '@tuturuuu/tasks-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { MiniSparkline } from '@tuturuuu/ui/tasks/progress/mini-sparkline';
import { cn } from '@tuturuuu/utils/format';
import type { useTranslations } from 'next-intl';
import { useState } from 'react';

function LeaveButton({
  joinCode,
  onLeft,
  t,
  wsId,
}: {
  joinCode: string;
  onLeft: () => void;
  t: Translate;
  wsId: string;
}) {
  const mutation = useMutation({
    mutationFn: () => leaveTaskLeaderboard(wsId, { join_code: joinCode }),
    onSuccess: (response) => {
      if (response.ok) {
        toast.success(t('leaderboards.left'));
        onLeft();
      }
    },
  });
  return (
    <Button
      className="gap-1.5"
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
      size="sm"
      type="button"
      variant="ghost"
    >
      <LogOut className="size-3.5" />
      {t('leaderboards.leave')}
    </Button>
  );
}

type Translate = ReturnType<typeof useTranslations>;
const today = () => new Date().toISOString().slice(0, 10);

const PODIUM_STYLES = [
  'text-dynamic-yellow bg-dynamic-yellow/10 border-dynamic-yellow/30',
  'text-dynamic-sky bg-dynamic-sky/10 border-dynamic-sky/30',
  'text-dynamic-orange bg-dynamic-orange/10 border-dynamic-orange/30',
];

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

function JoinChallengeCard({
  onJoined,
  t,
  wsId,
}: {
  onJoined: () => void;
  t: Translate;
  wsId: string;
}) {
  const [code, setCode] = useState('');
  const mutation = useMutation({
    mutationFn: () => joinTaskLeaderboard(wsId, { join_code: code.trim() }),
    onSuccess: (response) => {
      if (response.ok) {
        toast.success(t('leaderboards.join_success'));
        setCode('');
        onJoined();
      } else {
        toast.error(t('leaderboards.join_error'));
      }
    },
    onError: () => toast.error(t('leaderboards.join_error')),
  });

  return (
    <Card className="border-dynamic-green/30 bg-dynamic-green/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="size-4 text-dynamic-green" />
          {t('leaderboards.join_title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (code.trim()) mutation.mutate();
          }}
        >
          <Input
            onChange={(event) => setCode(event.target.value)}
            placeholder={t('leaderboards.join_code')}
            value={code}
          />
          <Button disabled={!code.trim() || mutation.isPending} type="submit">
            {t('leaderboards.join')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Podium({
  rankings,
  t,
  unitLabel,
}: {
  rankings: TaskLeaderboardMember[];
  t: Translate;
  unitLabel?: string;
}) {
  const top = rankings.slice(0, 3);
  if (top.length === 0) {
    return (
      <p className="py-2 text-muted-foreground text-sm">
        {t('empty.leaderboards')}
      </p>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-2">
      {top.map((member, index) => (
        <div
          className={cn(
            'flex flex-col items-center gap-1 rounded-xl border p-3 text-center',
            PODIUM_STYLES[index]
          )}
          key={member.id}
        >
          {index === 0 ? (
            <Crown className="size-5" />
          ) : (
            <Medal className="size-5" />
          )}
          <span className="line-clamp-1 font-medium text-xs">
            {member.display_name || member.user_id}
          </span>
          <span className="font-bold text-sm tabular-nums">
            {Number(member.value ?? 0).toLocaleString()}
          </span>
          {unitLabel ? (
            <span className="text-[10px] text-muted-foreground">
              {unitLabel}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function LeaderboardsPanel(props: {
  createLeaderboardMutation: UseMutationResult<unknown, unknown, FormData>;
  createTeamMutation: UseMutationResult<
    unknown,
    unknown,
    { formData: FormData; leaderboardId: string }
  >;
  leaderboards: TaskLeaderboard[];
  metrics: TaskProgressMetric[];
  onJoined: () => void;
  selectedMetric: TaskProgressMetric | null;
  t: Translate;
  wsId: string;
}) {
  const {
    createLeaderboardMutation,
    createTeamMutation,
    leaderboards,
    metrics,
    onJoined,
    selectedMetric,
    t,
    wsId,
  } = props;

  const copyCode = (code: string) => {
    navigator.clipboard?.writeText(code).then(
      () => toast.success(t('leaderboards.share_code')),
      () => undefined
    );
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)]">
      <div className="order-2 grid h-fit gap-4 xl:sticky xl:top-6">
        <JoinChallengeCard onJoined={onJoined} t={t} wsId={wsId} />
        <Card>
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
                disabled={
                  !selectedMetric || createLeaderboardMutation.isPending
                }
              >
                <Trophy className="mr-2 h-4 w-4" />
                {t('actions.add_leaderboard')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
      <div className="order-1 grid gap-3">
        {leaderboards.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-sm">
              {t('empty.leaderboards')}
            </CardContent>
          </Card>
        ) : (
          leaderboards.map((leaderboard) => {
            const rankings = leaderboard.rankings ?? [];
            return (
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
                    <div className="flex shrink-0 items-center gap-1.5">
                      {leaderboard.joined && leaderboard.join_code ? (
                        <LeaveButton
                          joinCode={leaderboard.join_code}
                          onLeft={onJoined}
                          t={t}
                          wsId={wsId}
                        />
                      ) : null}
                      {!leaderboard.automatic && leaderboard.join_code ? (
                        <Button
                          className="gap-1.5"
                          onClick={() => copyCode(leaderboard.join_code)}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <Copy className="size-3.5" />
                          <span className="font-mono text-xs">
                            {leaderboard.join_code}
                          </span>
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <Podium
                    rankings={rankings}
                    t={t}
                    unitLabel={leaderboard.metric?.unit_label}
                  />

                  {rankings.length > 3 ? (
                    <div className="space-y-1.5">
                      {rankings.slice(3, 10).map((member) => (
                        <div
                          className="flex items-center justify-between gap-3 rounded-md border px-3 py-1.5 text-sm"
                          key={member.id}
                        >
                          <span className="min-w-0 flex-1 truncate text-muted-foreground">
                            #{member.rank}{' '}
                            {member.display_name || member.user_id}
                          </span>
                          {member.sparkline && member.sparkline.length > 0 ? (
                            <MiniSparkline
                              className="shrink-0 opacity-70"
                              data={member.sparkline}
                            />
                          ) : null}
                          <strong className="shrink-0 tabular-nums">
                            {Number(member.value ?? 0).toLocaleString()}
                          </strong>
                        </div>
                      ))}
                    </div>
                  ) : null}

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
            );
          })
        )}
      </div>
    </div>
  );
}
