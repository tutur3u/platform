'use client';

import {
  Activity,
  Clock3,
  Database,
  Download,
  Eye,
  FileJson,
  Maximize2,
} from '@tuturuuu/icons';
import type {
  ValseaClassroomArtifactResponse,
  ValseaObservabilityStage,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import type { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useMemo } from 'react';

type ValseaT = ReturnType<typeof useTranslations>;

export function ResearchObservabilityPanel({
  result,
  t,
}: {
  result: ValseaClassroomArtifactResponse;
  t: ValseaT;
}) {
  const stages = result.observability?.stages ?? [];
  const totalDurationMs = getTotalDuration(stages);
  const successfulStages = stages.filter(
    (stage) => stage.status === 'success'
  ).length;
  const providers = getUniqueProviders(stages);

  const exportRun = () => {
    const blob = new Blob([stringifyJson(result)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `valsea-mira-run-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="valsea-stack-card overflow-hidden border-dynamic-green/20 bg-dynamic-green/5 lg:col-span-6">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-dynamic-green" />
            <CardTitle>{t('research_observability_title')}</CardTitle>
          </div>
          <div className="flex flex-wrap gap-2">
            <ResearchConsoleDialog result={result} t={t}>
              <Button className="gap-2" size="sm" type="button">
                <Maximize2 className="h-4 w-4" />
                {t('research_open_console')}
              </Button>
            </ResearchConsoleDialog>
            <RunJsonDialog result={result} t={t}>
              <Button
                className="gap-2"
                size="sm"
                type="button"
                variant="outline"
              >
                <FileJson className="h-4 w-4" />
                {t('research_open_json')}
              </Button>
            </RunJsonDialog>
            <Button
              className="gap-2"
              onClick={exportRun}
              size="sm"
              type="button"
              variant="secondary"
            >
              <Download className="h-4 w-4" />
              {t('research_export_json')}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-4">
          <ResearchMetricCard
            icon={<Activity className="h-4 w-4" />}
            label={t('research_stage_count')}
            value={String(stages.length)}
          />
          <ResearchMetricCard
            icon={<Database className="h-4 w-4" />}
            label={t('research_successful_stages')}
            value={`${successfulStages}/${stages.length}`}
          />
          <ResearchMetricCard
            icon={<Clock3 className="h-4 w-4" />}
            label={t('research_total_time')}
            value={formatDuration(totalDurationMs)}
          />
          <ResearchMetricCard
            icon={<Eye className="h-4 w-4" />}
            label={t('research_provider_count')}
            value={String(providers.length)}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {stages.slice(0, 6).map((stage) => (
            <StageSummaryCard key={stage.id} stage={stage} t={t} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function RunJsonDialog({
  children,
  result,
  t,
}: {
  children: ReactNode;
  result: ValseaClassroomArtifactResponse;
  t: ValseaT;
}) {
  const json = useMemo(() => stringifyJson(result), [result]);

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="grid h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-none grid-rows-[auto_1fr] overflow-hidden p-0 sm:max-w-none">
        <DialogHeader className="border-foreground/10 border-b p-6 pr-14">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md border border-dynamic-cyan/20 bg-dynamic-cyan/10 text-dynamic-cyan">
              <FileJson className="h-4 w-4" />
            </span>
            <div>
              <DialogTitle>{t('research_json_title')}</DialogTitle>
              <DialogDescription>
                {t('research_json_description')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="min-h-0 overflow-auto bg-foreground/[0.025] p-4">
          <pre className="min-h-full rounded-md border border-foreground/10 bg-background/90 p-4 font-mono text-[11px] leading-5">
            {json}
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResearchConsoleDialog({
  children,
  result,
  t,
}: {
  children: ReactNode;
  result: ValseaClassroomArtifactResponse;
  t: ValseaT;
}) {
  const stages = result.observability?.stages ?? [];
  const providers = getUniqueProviders(stages);

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="grid h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-none grid-rows-[auto_1fr] overflow-hidden p-0 sm:max-w-none">
        <DialogHeader className="border-foreground/10 border-b p-6 pr-14">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md border border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green">
              <Eye className="h-4 w-4" />
            </span>
            <div>
              <DialogTitle>{t('research_console_title')}</DialogTitle>
              <DialogDescription>
                {t('research_console_description')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 overflow-hidden lg:grid-cols-[20rem_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-auto border-foreground/10 border-b bg-foreground/[0.025] p-4 lg:border-r lg:border-b-0">
            <div className="grid gap-3">
              <ResearchMetricCard
                icon={<Activity className="h-4 w-4" />}
                label={t('research_stage_count')}
                value={String(stages.length)}
              />
              <ResearchMetricCard
                icon={<Clock3 className="h-4 w-4" />}
                label={t('research_total_time')}
                value={formatDuration(getTotalDuration(stages))}
              />
              <div className="rounded-md border border-foreground/10 bg-background/80 p-3">
                <div className="font-mono text-foreground/45 text-xs uppercase tracking-[0.18em]">
                  {t('research_providers')}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {providers.length ? (
                    providers.map((provider) => (
                      <Badge key={provider} variant="outline">
                        {provider}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-foreground/60 text-sm">
                      {t('not_available')}
                    </span>
                  )}
                </div>
              </div>
              <TranscriptTrace result={result} t={t} />
            </div>
          </aside>

          <div className="min-h-0 space-y-4 overflow-auto p-4 lg:p-6">
            <section className="grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-semibold text-lg">
                  {t('research_stage_timeline')}
                </h3>
                <Badge variant="outline">
                  {stages.length} {t('research_stage_count')}
                </Badge>
              </div>
              {stages.map((stage, index) => (
                <StageTraceCard
                  index={index}
                  key={stage.id}
                  stage={stage}
                  t={t}
                />
              ))}
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <LayerPacket
                label={t('research_sentiment_layers')}
                payload={result.sentiment.layers ?? result.sentiment}
                t={t}
              />
              <LayerPacket
                label={t('research_pronunciation_trace')}
                payload={result.pronunciation ?? t('not_available')}
                t={t}
              />
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StageSummaryCard({
  stage,
  t,
}: {
  stage: ValseaObservabilityStage;
  t: ValseaT;
}) {
  return (
    <div className="rounded-md border border-foreground/10 bg-background/75 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-sm">{stage.label}</div>
          <div className="mt-1 text-foreground/55 text-xs">
            {[stage.provider, stage.model].filter(Boolean).join(' / ') ||
              t('not_available')}
          </div>
        </div>
        <StatusBadge status={stage.status} t={t} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant="outline">
          {stage.durationMs ? formatDuration(stage.durationMs) : '0ms'}
        </Badge>
        {stage.raw ? (
          <Badge variant="secondary">{t('research_stage_raw')}</Badge>
        ) : null}
      </div>
    </div>
  );
}

function StageTraceCard({
  index,
  stage,
  t,
}: {
  index: number;
  stage: ValseaObservabilityStage;
  t: ValseaT;
}) {
  return (
    <div className="rounded-md border border-foreground/10 bg-background/80 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-dynamic-green/20 bg-dynamic-green/10 font-mono text-dynamic-green text-xs">
            {String(index + 1).padStart(2, '0')}
          </div>
          <div>
            <div className="font-semibold">{stage.label}</div>
            <div className="mt-1 flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">
                {t('research_stage_provider')}: {stage.provider}
              </Badge>
              {stage.model ? (
                <Badge variant="outline">
                  {t('research_stage_model')}: {stage.model}
                </Badge>
              ) : null}
              <Badge variant="outline">
                {t('research_stage_duration')}:{' '}
                {stage.durationMs ? formatDuration(stage.durationMs) : '0ms'}
              </Badge>
            </div>
          </div>
        </div>
        <StatusBadge status={stage.status} t={t} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <TraceSummaryBox
          label={t('research_stage_input')}
          value={stage.inputSummary}
          fallback={t('not_available')}
        />
        <TraceSummaryBox
          label={t('research_stage_output')}
          value={stage.outputSummary}
          fallback={t('not_available')}
        />
      </div>

      <RawPayloadDetails payload={stage.raw} t={t} />
    </div>
  );
}

function TraceSummaryBox({
  fallback,
  label,
  value,
}: {
  fallback: string;
  label: string;
  value?: string;
}) {
  return (
    <div className="rounded-md border border-foreground/10 bg-foreground/[0.03] p-3">
      <div className="font-mono text-foreground/45 text-xs uppercase tracking-[0.16em]">
        {label}
      </div>
      <p className="mt-2 text-foreground/70 text-sm leading-6">
        {value || fallback}
      </p>
    </div>
  );
}

function RawPayloadDetails({ payload, t }: { payload: unknown; t: ValseaT }) {
  return (
    <details className="mt-4 rounded-md border border-foreground/10 bg-foreground/[0.03]">
      <summary className="flex cursor-pointer items-center justify-between gap-3 p-3 font-medium text-sm">
        <span>{t('research_stage_raw')}</span>
        <Badge variant="outline">
          {payload ? t('raw_collapsed') : t('research_no_raw_payload')}
        </Badge>
      </summary>
      <pre className="max-h-96 overflow-auto border-foreground/10 border-t p-3 font-mono text-[11px] leading-5">
        {payload ? stringifyJson(payload) : t('research_no_raw_payload')}
      </pre>
    </details>
  );
}

function LayerPacket({
  label,
  payload,
  t,
}: {
  label: string;
  payload: unknown;
  t: ValseaT;
}) {
  return (
    <div className="rounded-md border border-foreground/10 bg-background/80 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-semibold">{label}</h3>
        <Badge variant="outline">{t('research_stage_raw')}</Badge>
      </div>
      <pre className="max-h-96 overflow-auto rounded-md bg-foreground/[0.04] p-3 font-mono text-[11px] leading-5">
        {stringifyJson(payload)}
      </pre>
    </div>
  );
}

function TranscriptTrace({
  result,
  t,
}: {
  result: ValseaClassroomArtifactResponse;
  t: ValseaT;
}) {
  return (
    <div className="rounded-md border border-dynamic-cyan/20 bg-dynamic-cyan/5 p-3">
      <div className="font-mono text-dynamic-cyan text-xs uppercase tracking-[0.18em]">
        {t('research_source_trace')}
      </div>
      <div className="mt-3 grid gap-3">
        <TraceSummaryBox
          fallback={t('not_available')}
          label={t('source_spoken_transcript')}
          value={result.source.spokenTranscript || result.source.rawTranscript}
        />
        <TraceSummaryBox
          fallback={t('not_available')}
          label={t('source_reference_note')}
          value={result.source.referenceTranscript}
        />
      </div>
    </div>
  );
}

function ResearchMetricCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-foreground/10 bg-background/75 p-3">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md border border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green">
        {icon}
      </div>
      <div className="font-mono text-foreground/45 text-xs uppercase tracking-[0.16em]">
        {label}
      </div>
      <div className="mt-1 font-semibold text-lg">{value}</div>
    </div>
  );
}

function StatusBadge({
  status,
  t,
}: {
  status: ValseaObservabilityStage['status'];
  t: ValseaT;
}) {
  const variant = status === 'success' ? 'secondary' : 'outline';
  return (
    <Badge variant={variant}>{t(`research_stage_status_${status}`)}</Badge>
  );
}

function getTotalDuration(stages: ValseaObservabilityStage[]) {
  return stages.reduce((total, stage) => total + (stage.durationMs ?? 0), 0);
}

function getUniqueProviders(stages: ValseaObservabilityStage[]) {
  return Array.from(
    new Set(stages.map((stage) => stage.provider).filter(Boolean))
  );
}

function formatDuration(durationMs: number) {
  if (durationMs >= 1000) {
    return `${(durationMs / 1000).toFixed(1)}s`;
  }

  return `${Math.round(durationMs)}ms`;
}

function stringifyJson(value: unknown) {
  const seen = new WeakSet<object>();

  return (
    JSON.stringify(
      value,
      (_key, currentValue: unknown) => {
        if (typeof currentValue === 'bigint') {
          return currentValue.toString();
        }

        if (typeof currentValue === 'object' && currentValue !== null) {
          if (seen.has(currentValue)) {
            return '[Circular]';
          }
          seen.add(currentValue);
        }

        return currentValue;
      },
      2
    ) ?? ''
  );
}
