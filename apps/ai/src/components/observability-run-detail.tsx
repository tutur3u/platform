'use client';

import { AlertCircle, ChevronDownIcon, Cpu, Terminal } from '@tuturuuu/icons';
import type {
  AiStudioRun,
  AiStudioRunStep,
} from '@tuturuuu/internal-api/ai-studio';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { formatTraceDuration } from '@/lib/playground-trace';
import { RelativeTimestamp } from './relative-timestamp';
import { normalizeRunStatus, StatusPill } from './studio/status-pill';

export function ObservabilityRunDetail({
  isError,
  isLoading,
  onRetry,
  run,
  sourceLabel,
  statusLabel,
  steps,
}: {
  isError: boolean;
  isLoading: boolean;
  onRetry: () => void;
  run: AiStudioRun;
  sourceLabel: string;
  statusLabel: string;
  steps: AiStudioRunStep[];
}) {
  const t = useTranslations('ai-studio.observability');

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-sm">{t('request_details')}</p>
            <StatusPill
              label={statusLabel}
              status={normalizeRunStatus(run.status)}
            />
            <Badge variant="secondary">{sourceLabel}</Badge>
          </div>
          <p className="mt-1 text-muted-foreground text-xs">
            {run.sourceType === 'workspace_credit'
              ? t('ledger_event_description')
              : t('request_details_description')}
          </p>
        </div>
        <RelativeTimestamp value={run.completedAt ?? run.createdAt} />
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Datum label={t('request_id')} mono value={run.requestId} />
        <Datum label={t('run_id')} mono value={run.id} />
        <Datum label={t('model')} value={run.modelId} />
        <Datum label={t('feature')} value={run.feature} />
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Datum
          label={t('created')}
          value={<RelativeTimestamp value={run.createdAt} />}
        />
        <Datum
          label={t('completed')}
          value={<RelativeTimestamp value={run.completedAt} />}
        />
        <Datum
          label={t('latency')}
          value={formatTraceDuration(run.latencyMs)}
        />
        <Datum
          label={t('first_token_latency')}
          value={formatTraceDuration(run.firstTokenLatencyMs)}
        />
      </div>

      <RunAccounting run={run} />

      {run.errorClass ? (
        <div className="flex items-center gap-2 rounded-lg border border-dynamic-red/30 bg-dynamic-red/5 px-3 py-2 text-sm">
          <AlertCircle className="size-4 text-dynamic-red" />
          <span className="text-muted-foreground">{t('error_class')}</span>
          <code className="font-medium font-mono text-xs">
            {run.errorClass}
          </code>
        </div>
      ) : null}

      <div className="space-y-2 border-t pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-sm">{t('execution_trace')}</p>
          <Badge variant="secondary">
            {t('step_count', { count: steps.length || run.stepCount })}
          </Badge>
          {run.toolCallCount > 0 ? (
            <Badge variant="outline">
              {t('tool_call_count', { count: run.toolCallCount })}
            </Badge>
          ) : null}
        </div>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : isError ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-dynamic-red/30 bg-dynamic-red/5 p-3">
            <p className="text-dynamic-red text-sm">{t('trace_error')}</p>
            <Button onClick={onRetry} size="sm" variant="outline">
              {t('retry')}
            </Button>
          </div>
        ) : steps.length > 0 ? (
          <div className="space-y-2">
            {steps.map((step) => (
              <HistoricalStep key={step.sequence} step={step} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-5 text-center">
            <p className="font-medium text-sm">{t('no_steps_title')}</p>
            <p className="mt-1 text-muted-foreground text-xs">
              {t('no_steps_description')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function HistoricalStep({ step }: { step: AiStudioRunStep }) {
  const t = useTranslations('ai-studio.observability');
  const [open, setOpen] = useState(false);
  const StepIcon = step.kind === 'tool' ? Terminal : Cpu;

  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <div
        className={cn(
          'overflow-hidden rounded-lg border bg-background',
          open && 'border-foreground/20'
        )}
      >
        <CollapsibleTrigger asChild>
          <button
            className="grid w-full grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] items-center gap-2 px-3 py-3 text-left hover:bg-muted/40"
            type="button"
          >
            <Badge variant="secondary">#{step.sequence + 1}</Badge>
            <StepIcon className="size-4 text-primary" />
            <div className="min-w-0">
              <p className="truncate font-medium text-sm">{step.name}</p>
              <p className="truncate text-muted-foreground text-xs">
                {step.modelId ?? t(`step_${step.kind}`)}
              </p>
            </div>
            <span className="text-muted-foreground text-xs tabular-nums">
              {formatTraceDuration(step.latencyMs)}
            </span>
            <ChevronDownIcon
              className={cn(
                'size-4 text-muted-foreground transition-transform',
                open && 'rotate-180'
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="grid gap-2 border-t bg-muted/10 p-3 sm:grid-cols-2 xl:grid-cols-4">
            <Datum label={t('status')} value={t(`status_${step.status}`)} />
            <Datum label={t('step_type')} value={t(`step_${step.kind}`)} />
            <Datum
              label={t('latency')}
              value={formatTraceDuration(step.latencyMs)}
            />
            <Datum label={t('model')} value={step.modelId} />
            <Datum
              label={t('input_tokens')}
              value={step.inputTokens.toLocaleString()}
            />
            <Datum
              label={t('output_tokens')}
              value={step.outputTokens.toLocaleString()}
            />
            <Datum
              label={t('billed_credits')}
              value={formatNumber(step.billedCredits, 4)}
            />
            <Datum
              label={t('provider_cost_short')}
              value={`$${formatNumber(step.providerCostUsd, 6)}`}
            />
            <Datum
              label={t('started')}
              value={<RelativeTimestamp value={step.startedAt} />}
            />
            <Datum
              label={t('completed')}
              value={<RelativeTimestamp value={step.completedAt} />}
            />
            <Datum label={t('error_class')} value={step.errorClass} />
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function RunAccounting({ run }: { run: AiStudioRun }) {
  const t = useTranslations('ai-studio.observability');
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      <Datum
        label={t('input_tokens')}
        value={run.inputTokens.toLocaleString()}
      />
      <Datum
        label={t('output_tokens')}
        value={run.outputTokens.toLocaleString()}
      />
      <Datum
        label={t('reasoning_tokens')}
        value={run.reasoningTokens.toLocaleString()}
      />
      <Datum
        label={t('embedding_units')}
        value={run.embeddingUnits.toLocaleString()}
      />
      <Datum label={t('image_units')} value={run.imageUnits.toLocaleString()} />
      <Datum
        label={t('search_units')}
        value={run.searchUnits.toLocaleString()}
      />
      <Datum
        label={t('billed_credits')}
        value={formatNumber(run.billedCredits, 4)}
      />
      <Datum
        label={t('provider_cost')}
        value={`$${formatNumber(run.providerCostUsd, 6)}`}
      />
      <Datum
        label={t('step_count_label')}
        value={run.stepCount.toLocaleString()}
      />
      <Datum
        label={t('tool_calls')}
        value={run.toolCallCount.toLocaleString()}
      />
    </div>
  );
}

function Datum({
  label,
  mono,
  value,
}: {
  label: string;
  mono?: boolean;
  value: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-lg border bg-background px-3 py-2">
      <p className="truncate font-medium text-muted-foreground text-xs uppercase tracking-[0.06em]">
        {label}
      </p>
      <div
        className={cn(
          'mt-1 break-all font-medium text-sm tabular-nums',
          mono && 'font-mono text-xs'
        )}
      >
        {value ?? '—'}
      </div>
    </div>
  );
}

function formatNumber(value: number, maximumFractionDigits: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits });
}
