'use client';
import { Coins } from '@tuturuuu/icons';
import type { getMeetAiState } from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
export function AiCosts({
  data,
}: {
  data: Awaited<ReturnType<typeof getMeetAiState>>;
}) {
  const t = useTranslations('meet.call');
  const at = useTranslations('meet.ai');
  if (!data.canManage) return null;
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <h3 className="flex items-center gap-2 font-medium text-sm">
        <Coins className="size-4" />
        {t('cost_breakdown')}
      </h3>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt>{at('transcript')}</dt>
        <dd className="text-right font-mono">
          {data.transcriptionCostUsd == null
            ? '—'
            : `$${data.transcriptionCostUsd.toFixed(6)}`}
        </dd>
        <dt>{at('notes')}</dt>
        <dd className="text-right font-mono">
          {data.notesCostUsd == null ? '—' : `$${data.notesCostUsd.toFixed(6)}`}
        </dd>
        <dt>{at('input_tokens')}</dt>
        <dd className="text-right tabular-nums">
          {data.inputTokens?.toLocaleString() ?? '—'}
        </dd>
        <dt>{at('output_tokens')}</dt>
        <dd className="text-right tabular-nums">
          {data.outputTokens?.toLocaleString() ?? '—'}
        </dd>
        <dt>{at('model')}</dt>
        <dd className="break-all text-right text-xs">{data.model}</dd>
      </dl>
      {!!data.unpricedRequests && (
        <p className="text-muted-foreground text-xs">
          {at('unpriced', { count: data.unpricedRequests })}
        </p>
      )}
    </section>
  );
}
