'use client';

import {
  CheckCircle2,
  ChevronDownIcon,
  CircleX,
  Cpu,
  Terminal,
} from '@tuturuuu/icons';
import type { AiStudioPlaygroundStep } from '@tuturuuu/internal-api/ai-studio';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  formatTraceDuration,
  summarizePlaygroundTrace,
} from '@/lib/playground-trace';
import {
  ModelStepDetails,
  StepDetail,
  ToolStepDetails,
} from './playground-step-details';
import { RelativeTimestamp } from './relative-timestamp';

export function PlaygroundStepInspector({
  steps,
  totalTokens,
}: {
  steps: AiStudioPlaygroundStep[];
  totalTokens: number;
}) {
  const t = useTranslations('ai-studio.playground_console');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const summary = summarizePlaygroundTrace(steps);
  const allExpanded = expanded.size === steps.length;

  const toggleAll = () => {
    setExpanded(
      allExpanded ? new Set() : new Set(steps.map((step) => step.sequence))
    );
  };

  return (
    <section className="space-y-3 border-t pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-sm">{t('execution_trace')}</p>
            <Badge variant="secondary">
              {t('step_count', { count: steps.length })}
            </Badge>
          </div>
          <p className="mt-1 text-muted-foreground text-xs">
            {t('safe_trace_note')}
          </p>
        </div>
        <Button onClick={toggleAll} size="sm" type="button" variant="outline">
          {allExpanded ? t('collapse_all') : t('expand_all')}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <TraceMetric
          label={t('trace_span')}
          value={formatTraceDuration(summary.durationMs)}
        />
        <TraceMetric
          label={t('model_steps')}
          value={summary.modelSteps.toLocaleString()}
        />
        <TraceMetric
          label={t('tool_calls')}
          value={summary.toolSteps.toLocaleString()}
        />
        <TraceMetric label={t('tokens')} value={totalTokens.toLocaleString()} />
      </div>

      <div className="space-y-2">
        {steps.map((step) => (
          <StepRow
            key={`${step.sequence}-${step.name}`}
            onOpenChange={(open) => {
              setExpanded((current) => {
                const next = new Set(current);
                if (open) next.add(step.sequence);
                else next.delete(step.sequence);
                return next;
              });
            }}
            open={expanded.has(step.sequence)}
            step={step}
          />
        ))}
      </div>
    </section>
  );
}

function StepRow({
  onOpenChange,
  open,
  step,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  step: AiStudioPlaygroundStep;
}) {
  const t = useTranslations('ai-studio.playground_console');
  const failed = step.status === 'failed';
  const StepIcon = step.type === 'tool' ? Terminal : Cpu;
  const StatusIcon = failed ? CircleX : CheckCircle2;

  return (
    <Collapsible onOpenChange={onOpenChange} open={open}>
      <div
        className={cn(
          'overflow-hidden rounded-xl border bg-background transition-colors',
          open && 'border-foreground/20 bg-muted/10'
        )}
      >
        <CollapsibleTrigger asChild>
          <button
            aria-label={t('toggle_step', { number: step.sequence + 1 })}
            className="grid w-full grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] items-center gap-2 px-3 py-3 text-left transition-colors hover:bg-muted/40 sm:gap-3"
            type="button"
          >
            <Badge variant="secondary">#{step.sequence + 1}</Badge>
            <StepIcon className="size-4 text-primary" />
            <div className="min-w-0">
              <p className="truncate font-medium text-sm">{step.name}</p>
              <p className="truncate text-muted-foreground text-xs">
                {t(`step_${step.type}`)}
                {step.finishReason ? ` · ${step.finishReason}` : ''}
              </p>
            </div>
            <span className="hidden items-center gap-1.5 text-muted-foreground text-xs tabular-nums sm:flex">
              <StatusIcon
                className={cn('size-3.5', failed && 'text-destructive')}
              />
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
          <div className="space-y-4 border-t bg-muted/10 p-4">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <StepDetail
                label={t('status')}
                value={t(`status_${step.status}`)}
              />
              <StepDetail
                label={t('duration')}
                value={formatTraceDuration(step.latencyMs)}
              />
              <StepDetail
                label={t('started')}
                value={<RelativeTimestamp value={step.startedAt} />}
              />
              <StepDetail
                label={t('completed')}
                value={<RelativeTimestamp value={step.completedAt} />}
              />
            </div>

            {step.type === 'model' ? (
              <ModelStepDetails step={step} />
            ) : (
              <ToolStepDetails step={step} />
            )}

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <StepDetail label={t('call_id')} value={step.callId} mono />
              <StepDetail
                label={
                  step.type === 'tool' ? t('tool_call_id') : t('response_id')
                }
                value={step.type === 'tool' ? step.toolCallId : step.responseId}
                mono
              />
              <StepDetail
                label={t('step_type')}
                value={t(`step_${step.type}`)}
              />
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function TraceMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/15 px-3 py-2">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-1 font-medium text-sm tabular-nums">{value}</p>
    </div>
  );
}
