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
import Link from 'next/link';
import type { AiStudioOverview } from '@/lib/studio-data';
import { ApiKeysPanel } from './api-keys-panel';
import { CatalogPanel } from './catalog-panel';
import { ObservabilityPanel } from './observability-panel';
import { PlaygroundPanel } from './playground-panel';

interface StudioPageLabels {
  activeKeys: string;
  activeModels: string;
  costThisMonth: string;
  creditsUsed: string;
  empty: string;
  feature: string;
  model: string;
  moduleReady: string;
  moduleReadyDescription: string;
  noActivity: string;
  openPlayground: string;
  privatePreview: string;
  recentRuns: string;
  request: string;
  status: string;
  tokens: string;
  viewAll: string;
}

export function StudioPage({
  canManageAiKeys,
  data,
  description,
  labels,
  section,
  title,
  workspaceId,
}: {
  canManageAiKeys: boolean;
  data: AiStudioOverview | null;
  description: string;
  labels: StudioPageLabels;
  section: string;
  title: string;
  workspaceId: string;
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
      href: `/${workspaceId}/runs`,
      icon: Activity,
      label: labels.recentRuns,
      value: data?.runs.length.toLocaleString() ?? '—',
    },
    {
      href: `/${workspaceId}/credits`,
      icon: Coins,
      label: labels.creditsUsed,
      value:
        data?.totals.billedCredits.toLocaleString(undefined, {
          maximumFractionDigits: 4,
        }) ?? '—',
    },
    {
      href: `/${workspaceId}/usage`,
      icon: Clock3,
      label: labels.costThisMonth,
      value: data ? `$${data.totals.providerCostUsd.toFixed(4)}` : '—',
    },
    {
      href: `/${workspaceId}/runs`,
      icon: Cpu,
      label: labels.activeModels,
      value: activeModels.toLocaleString(),
    },
  ];

  const catalogResource =
    section === 'prompts' || section === 'agents' || section === 'datasets'
      ? section
      : null;

  return (
    <div className="mx-auto max-w-[110rem] space-y-5 p-3 sm:p-4 lg:p-8">
      <header className="relative isolate flex flex-col gap-4 overflow-hidden rounded-2xl border bg-background/80 p-5 shadow-sm backdrop-blur md:flex-row md:items-end md:justify-between lg:p-6">
        <div className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-primary/[0.07] blur-3xl" />
        <div className="relative">
          <div className="mb-2 flex items-center gap-2">
            <Badge variant="secondary">
              <Sparkles className="mr-1 size-3" />
              AI Studio
            </Badge>
            <Badge variant="outline">{labels.privatePreview}</Badge>
          </div>
          <h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">
            {title}
          </h1>
          <p className="mt-1 max-w-3xl text-muted-foreground">{description}</p>
        </div>
        {section !== 'playground' ? (
          <Button asChild className="relative shrink-0">
            <Link href={`/${workspaceId}/playground`}>
              {labels.openPlayground}
              <ArrowUpRight className="ml-2 size-4" />
            </Link>
          </Button>
        ) : null}
      </header>

      {section === 'overview' ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map(({ href, icon: Icon, label, value }) => (
              <Card
                className="group overflow-hidden transition-colors hover:border-primary/30 hover:bg-muted/10"
                key={label}
              >
                <Link
                  className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  href={href}
                >
                  <CardHeader className="flex-row items-center justify-between pb-2">
                    <CardTitle className="font-medium text-muted-foreground text-sm">
                      {label}
                    </CardTitle>
                    <div className="rounded-lg border bg-background p-2 transition-transform group-hover:-translate-y-0.5">
                      <Icon className="size-4 text-primary" />
                    </div>
                  </CardHeader>
                  <CardContent className="font-semibold text-3xl tabular-nums">
                    {value}
                  </CardContent>
                </Link>
              </Card>
            ))}
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.6fr)]">
            <Card className="overflow-hidden">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>{labels.recentRuns}</CardTitle>
                <Button asChild size="sm" variant="ghost">
                  <Link href={`/${workspaceId}/runs`}>
                    {labels.viewAll}
                    <ArrowUpRight className="ml-2 size-3.5" />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {data?.runs.length ? (
                  data.runs.slice(0, 8).map((run) => (
                    <Link
                      className="grid min-w-0 gap-2 rounded-xl border p-3 text-sm transition-colors hover:border-primary/30 hover:bg-muted/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:grid-cols-[minmax(8rem,1fr)_minmax(8rem,1fr)_auto_auto]"
                      href={`/${workspaceId}/runs?run=${encodeURIComponent(run.id)}`}
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
                    </Link>
                  ))
                ) : (
                  <EmptyState label={labels.empty} />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>
                  {canManageAiKeys ? labels.activeKeys : labels.tokens}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="font-semibold text-4xl">
                  {canManageAiKeys
                    ? activeKeys
                    : (
                        (data?.totals.inputTokens ?? 0) +
                        (data?.totals.outputTokens ?? 0)
                      ).toLocaleString()}
                </div>
                {canManageAiKeys ? (
                  <p className="mt-2 text-muted-foreground text-sm">
                    {data?.totals.inputTokens.toLocaleString()} +{' '}
                    {data?.totals.outputTokens.toLocaleString()} {labels.tokens}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </>
      ) : section === 'api-keys' ? (
        <ApiKeysPanel workspaceId={workspaceId} />
      ) : section === 'playground' ? (
        <PlaygroundPanel
          canManageAiKeys={canManageAiKeys}
          workspaceId={workspaceId}
        />
      ) : catalogResource ? (
        <CatalogPanel
          resource={catalogResource}
          title={title}
          workspaceId={workspaceId}
        />
      ) : section === 'runs' ||
        section === 'logs' ||
        section === 'usage' ||
        section === 'credits' ? (
        <ObservabilityPanel section={section} workspaceId={workspaceId} />
      ) : (
        <InstrumentCard
          title={title}
          description={labels.moduleReadyDescription}
          emptyLabel={labels.noActivity}
          eyebrow={labels.moduleReady}
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
  emptyLabel,
  eyebrow,
  title,
}: {
  description: string;
  emptyLabel: string;
  eyebrow: string;
  title: string;
}) {
  return (
    <Card className="min-h-72 overflow-hidden">
      <CardHeader>
        <Badge className="w-fit" variant="secondary">
          {eyebrow}
        </Badge>
        <CardTitle>{title}</CardTitle>
        <p className="text-muted-foreground text-sm">{description}</p>
      </CardHeader>
      <CardContent>
        <div className="grid h-40 place-items-center rounded-xl border border-dashed bg-foreground/[0.015]">
          <div className="text-center">
            <Activity className="mx-auto mb-3 size-6 text-primary" />
            <p className="text-muted-foreground text-sm">{emptyLabel}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
