'use client';

import { ChevronDown, CircleAlert, Info } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';

export type MindAiDebugContext = {
  boardId: string | null;
  creditSource: string;
  creditWsId: string;
  modelId: string;
  runId: string | null;
  runStartedAt: string | null;
  status: string;
  threadId: string;
  thinkingMode: string;
  writeMode: string;
  wsId: string;
};

export function MindAiDebugDetails({
  context,
  defaultOpen,
  tone = 'neutral',
}: {
  context: MindAiDebugContext;
  defaultOpen?: boolean;
  tone?: 'error' | 'neutral';
}) {
  const t = useTranslations('mind');
  const Icon = tone === 'error' ? CircleAlert : Info;

  return (
    <details
      className={cn(
        'group rounded-md border bg-background/70 text-xs',
        tone === 'error' ? 'border-dynamic-red/30' : 'border-border'
      )}
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-1.5 marker:hidden">
        <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
          <Icon
            className={cn(
              'h-3.5 w-3.5 shrink-0',
              tone === 'error' && 'text-dynamic-red'
            )}
          />
          <span className="truncate">{t('ai.debugDetails')}</span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition group-open:rotate-180" />
      </summary>
      <dl className="grid gap-1 border-border border-t p-2 font-mono text-[10px] text-muted-foreground">
        <DebugRow label={t('ai.debugStatus')} value={context.status} />
        <DebugRow label={t('ai.debugModel')} value={context.modelId} />
        <DebugRow
          label={t('ai.debugMode')}
          value={`${context.thinkingMode}/${context.writeMode}`}
        />
        <DebugRow
          label={t('ai.debugCredits')}
          value={`${context.creditSource}:${context.creditWsId}`}
        />
        <DebugRow label={t('ai.debugThread')} value={context.threadId} />
        <DebugRow label={t('ai.debugRun')} value={context.runId ?? '-'} />
        <DebugRow
          label={t('ai.debugStarted')}
          value={context.runStartedAt ?? '-'}
        />
        <DebugRow label={t('ai.debugBoard')} value={context.boardId ?? '-'} />
        <DebugRow label={t('ai.debugWorkspace')} value={context.wsId} />
      </dl>
    </details>
  );
}

function DebugRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 grid-cols-[5rem_1fr] gap-2">
      <dt className="truncate uppercase">{label}</dt>
      <dd className="min-w-0 truncate text-foreground/80">{value}</dd>
    </div>
  );
}
