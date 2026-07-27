import {
  Activity,
  ArrowUpRight,
  Clock3,
  Coins,
  Cpu,
  Sparkles,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import type { AiStudioOverview } from '@/lib/studio-data';

interface StudioPageLabels {
  activeKeys: string;
  activeModels: string;
  costThisMonth: string;
  creditsUsed: string;
  empty: string;
  feature: string;
  model: string;
  recentRuns: string;
  request: string;
  status: string;
  tokens: string;
}

export function StudioPage({
  data,
  description,
  labels,
  section,
  title,
}: {
  data: AiStudioOverview | null;
  description: string;
  labels: StudioPageLabels;
  section: string;
  title: string;
}) {
  const now = Date.now();
  const activeKeys =
    data?.keys.filter(
      (key) =>
        !key.revoked_at &&
        (!key.expires_at || new Date(key.expires_at).getTime() > now)
    ).length ?? 0;
  const activeModels = data
    ? new Set(data.runs.map((run) => run.model_id).filter(Boolean)).size
    : 0;
  const metrics = [
    {
      icon: Activity,
      label: labels.recentRuns,
      value: data?.runs.length.toLocaleString() ?? '—',
    },
    {
      icon: Coins,
      label: labels.creditsUsed,
      value:
        data?.totals.billedCredits.toLocaleString(undefined, {
          maximumFractionDigits: 4,
        }) ?? '—',
    },
    {
      icon: Clock3,
      label: labels.costThisMonth,
      value: data ? `$${data.totals.providerCostUsd.toFixed(4)}` : '—',
    },
    {
      icon: Cpu,
      label: labels.activeModels,
      value: activeModels.toLocaleString(),
    },
  ];

  const sectionRows =
    section === 'api-keys'
      ? data?.keys.map((key) => ({
          description: key.prefix,
          id: key.id,
          label: key.name,
          meta: key.revoked_at ? 'revoked' : key.environment,
        }))
      : section === 'prompts'
        ? data?.prompts.map((prompt) => ({
            description: prompt.description,
            id: prompt.id,
            label: prompt.name,
            meta: `v${prompt.latest_version}`,
          }))
        : section === 'agents'
          ? data?.agents.map((agent) => ({
              description: agent.description,
              id: agent.id,
              label: agent.name,
              meta: `v${agent.latest_version}`,
            }))
          : section === 'datasets' || section === 'evaluations'
            ? data?.datasets.map((dataset) => ({
                description: dataset.description,
                id: dataset.id,
                label: dataset.name,
                meta: '',
              }))
            : undefined;

  return (
    <div className="mx-auto max-w-[110rem] space-y-6 p-4 lg:p-8">
      <header className="flex flex-col gap-4 rounded-2xl border bg-background/70 p-5 shadow-sm backdrop-blur md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Badge variant="secondary">
              <Sparkles className="mr-1 size-3" />
              AI Studio
            </Badge>
            <Badge variant="outline">Private preview</Badge>
          </div>
          <h1 className="font-semibold text-3xl tracking-tight">{title}</h1>
          <p className="mt-1 max-w-3xl text-muted-foreground">{description}</p>
        </div>
        <Button>
          Open playground
          <ArrowUpRight className="ml-2 size-4" />
        </Button>
      </header>

      {section === 'overview' ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map(({ icon: Icon, label, value }) => (
              <Card key={label}>
                <CardHeader className="flex-row items-center justify-between pb-2">
                  <CardTitle className="font-medium text-muted-foreground text-sm">
                    {label}
                  </CardTitle>
                  <Icon className="size-4 text-primary" />
                </CardHeader>
                <CardContent className="font-semibold text-3xl">
                  {value}
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.6fr)]">
            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle>{labels.recentRuns}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data?.runs.length ? (
                  data.runs.slice(0, 8).map((run) => (
                    <div
                      className="grid min-w-0 gap-2 rounded-xl border p-3 text-sm sm:grid-cols-[minmax(8rem,1fr)_minmax(8rem,1fr)_auto_auto]"
                      key={run.id}
                    >
                      <span className="truncate font-medium">
                        {run.request_id}
                      </span>
                      <span className="truncate text-muted-foreground">
                        {run.model_id}
                      </span>
                      <Badge variant="outline">{run.feature}</Badge>
                      <Badge variant="secondary">{run.status}</Badge>
                    </div>
                  ))
                ) : (
                  <EmptyState label={labels.empty} />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{labels.activeKeys}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="font-semibold text-4xl">{activeKeys}</div>
                <p className="mt-2 text-muted-foreground text-sm">
                  {data?.totals.inputTokens.toLocaleString()} +{' '}
                  {data?.totals.outputTokens.toLocaleString()} {labels.tokens}
                </p>
              </CardContent>
            </Card>
          </div>
        </>
      ) : sectionRows ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            {sectionRows.length ? (
              sectionRows.map((row) => (
                <div
                  className="flex min-w-0 items-center gap-3 rounded-xl border p-3"
                  key={row.id}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{row.label}</div>
                    <div className="truncate text-muted-foreground text-sm">
                      {row.description || row.id}
                    </div>
                  </div>
                  {row.meta ? (
                    <Badge variant="outline">{row.meta}</Badge>
                  ) : null}
                </div>
              ))
            ) : (
              <EmptyState label={labels.empty} />
            )}
          </CardContent>
        </Card>
      ) : section === 'runs' || section === 'logs' || section === 'usage' ? (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="border-b text-muted-foreground">
                <tr>
                  <th className="p-4 font-medium">{labels.request}</th>
                  <th className="p-4 font-medium">{labels.model}</th>
                  <th className="p-4 font-medium">{labels.feature}</th>
                  <th className="p-4 font-medium">{labels.status}</th>
                  <th className="p-4 text-right font-medium">
                    {labels.tokens}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data?.runs.map((run) => (
                  <tr className="border-b last:border-0" key={run.id}>
                    <td className="max-w-64 truncate p-4 font-mono text-xs">
                      {run.request_id}
                    </td>
                    <td className="p-4">{run.model_id}</td>
                    <td className="p-4">{run.feature}</td>
                    <td className="p-4">
                      <Badge variant="outline">{run.status}</Badge>
                    </td>
                    <td className="p-4 text-right">
                      {run.input_tokens + run.output_tokens}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data?.runs.length ? <EmptyState label={labels.empty} /> : null}
          </CardContent>
        </Card>
      ) : (
        <InstrumentCard
          title={title}
          description={`${description} This workspace-scoped surface is ready for its data workflow and policy controls.`}
        />
      )}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="grid min-h-36 place-items-center rounded-xl border border-dashed text-muted-foreground text-sm">
      {label}
    </div>
  );
}

function InstrumentCard({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <Card className="min-h-72 overflow-hidden">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-muted-foreground text-sm">{description}</p>
      </CardHeader>
      <CardContent>
        <div className="grid h-40 place-items-center rounded-xl border border-dashed bg-foreground/[0.015]">
          <div className="text-center">
            <Activity className="mx-auto mb-3 size-6 text-primary" />
            <p className="text-muted-foreground text-sm">No activity yet</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
