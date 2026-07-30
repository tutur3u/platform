'use client';

import type { AiStudioPlaygroundStep } from '@tuturuuu/internal-api/ai-studio';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { formatTraceDuration, formatTraceJson } from '@/lib/playground-trace';

export function ModelStepDetails({ step }: { step: AiStudioPlaygroundStep }) {
  const t = useTranslations('ai-studio.playground_console');
  const totalTokens = (step.inputTokens ?? 0) + (step.outputTokens ?? 0);

  return (
    <>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <StepDetail label={t('provider')} value={step.provider} />
        <StepDetail
          label={t('model_id')}
          value={step.modelId ?? step.name}
          mono
        />
        <StepDetail label={t('finish_reason')} value={step.finishReason} />
        <StepDetail
          label={t('tool_activity')}
          value={t('tool_activity_value', {
            calls: step.toolCallCount ?? 0,
            results: step.toolResultCount ?? 0,
          })}
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <StepDetail
          label={t('input_tokens')}
          value={(step.inputTokens ?? 0).toLocaleString()}
        />
        <StepDetail
          label={t('output_tokens')}
          value={(step.outputTokens ?? 0).toLocaleString()}
        />
        <StepDetail
          label={t('reasoning_tokens')}
          value={(step.reasoningTokens ?? 0).toLocaleString()}
        />
        <StepDetail
          label={t('total_tokens')}
          value={totalTokens.toLocaleString()}
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <StepDetail
          label={t('response_time')}
          value={formatTraceDuration(step.responseTimeMs)}
        />
        <StepDetail
          label={t('time_to_first_output')}
          value={formatTraceDuration(step.timeToFirstOutputMs)}
        />
        <StepDetail
          label={t('output_throughput')}
          value={
            step.effectiveOutputTokensPerSecond == null
              ? '—'
              : t('tokens_per_second', {
                  count: step.effectiveOutputTokensPerSecond.toLocaleString(
                    undefined,
                    { maximumFractionDigits: 1 }
                  ),
                })
          }
        />
        <StepDetail
          label={t('cached_input_tokens')}
          value={(step.cachedInputTokens ?? 0).toLocaleString()}
        />
      </div>
    </>
  );
}

export function ToolStepDetails({ step }: { step: AiStudioPlaygroundStep }) {
  const t = useTranslations('ai-studio.playground_console');
  return (
    <div className="grid gap-3 xl:grid-cols-2">
      <JsonDetail label={t('tool_input')} value={step.inputJson} />
      <JsonDetail label={t('tool_output')} value={step.outputJson} />
    </div>
  );
}

export function StepDetail({
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
      <p className="text-muted-foreground text-xs">{label}</p>
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

function JsonDetail({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border bg-background">
      <p className="border-b px-3 py-2 font-medium text-xs">{label}</p>
      <pre className="max-h-56 overflow-auto p-3 font-mono text-xs leading-5">
        {formatTraceJson(value)}
      </pre>
    </div>
  );
}
