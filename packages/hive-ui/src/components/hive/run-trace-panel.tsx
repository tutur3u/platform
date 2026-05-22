'use client';

import { CheckCircle2, CircleAlert, Clock } from '@tuturuuu/icons';
import type {
  HivePairQueueResponse,
  HiveWorkflowRun,
} from '@tuturuuu/internal-api/hive';
import { Badge } from '@tuturuuu/ui/badge';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { useTranslations } from 'next-intl';

type RunTracePanelProps = {
  pairQueue?: HivePairQueueResponse | null;
  workflowRun?: HiveWorkflowRun | null;
};

export function RunTracePanel({ pairQueue, workflowRun }: RunTracePanelProps) {
  const t = useTranslations('studio.trace');
  const pairResults = pairQueue?.results ?? [];
  const workflowSteps = workflowRun?.stepTrace ?? [];

  return (
    <section className="min-h-0 rounded-lg border border-border bg-background/92 text-foreground shadow-foreground/10 shadow-lg backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3 border-border border-b px-3 py-2">
        <p className="font-semibold text-sm">{t('title')}</p>
        <Badge variant="outline">
          {pairResults.length > 0
            ? t('pairs', { count: pairResults.length })
            : workflowSteps.length > 0
              ? t('steps', { count: workflowSteps.length })
              : t('empty_badge')}
        </Badge>
      </div>
      <ScrollArea className="h-44">
        <div className="space-y-2 p-3">
          {pairResults.length > 0
            ? pairResults.map((result) => (
                <div
                  className="rounded-md border border-border bg-muted/20 p-2"
                  key={`${result.index}:${result.pair.sourceNpcId}:${result.pair.targetNpcId}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {result.ok ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-dynamic-green" />
                      ) : (
                        <CircleAlert className="h-3.5 w-3.5 text-dynamic-red" />
                      )}
                      <p className="truncate font-medium text-xs">
                        {result.pair.sourceNpcId.slice(0, 8)} {'->'}{' '}
                        {result.pair.targetNpcId.slice(0, 8)}
                      </p>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      #{result.index + 1}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-muted-foreground text-xs">
                    {result.error ??
                      result.runs
                        .map((run) =>
                          typeof run.outputDecision.spokenText === 'string'
                            ? run.outputDecision.spokenText
                            : null
                        )
                        .filter(Boolean)
                        .join(' ')}
                  </p>
                </div>
              ))
            : workflowSteps.map((step) => (
                <div
                  className="rounded-md border border-border bg-muted/20 p-2"
                  key={`${workflowRun?.id}:${step.nodeId}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-dynamic-blue" />
                      <p className="truncate font-medium text-xs">
                        {step.nodeId}
                      </p>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {step.nodeType}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-muted-foreground text-xs">
                    {step.error ?? JSON.stringify(step.output ?? {})}
                  </p>
                </div>
              ))}
          {pairResults.length === 0 && workflowSteps.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('empty')}</p>
          ) : null}
        </div>
      </ScrollArea>
    </section>
  );
}
