'use client';

import type { HiveWorkflowRun } from '@tuturuuu/internal-api/hive';
import { Badge } from '@tuturuuu/ui/badge';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { useTranslations } from 'next-intl';

type WorkflowRunPanelProps = {
  latestRun?: HiveWorkflowRun | null;
  runs: HiveWorkflowRun[];
};

export function WorkflowRunPanel({ latestRun, runs }: WorkflowRunPanelProps) {
  const t = useTranslations('studio.workflows.run_panel');
  const activeRun = latestRun ?? runs[0] ?? null;

  return (
    <section className="h-56 border-border/70 border-t bg-background/92 backdrop-blur-xl">
      <div className="flex h-full min-w-0">
        <div className="w-72 shrink-0 border-border/70 border-r p-4">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">
            {t('eyebrow')}
          </p>
          <h2 className="mt-1 font-semibold">{t('title')}</h2>
          <p className="mt-2 text-muted-foreground text-xs">
            {activeRun ? activeRun.id : t('empty')}
          </p>
          {activeRun ? (
            <Badge className="mt-3" variant="outline">
              {activeRun.status}
            </Badge>
          ) : null}
        </div>
        <ScrollArea className="min-w-0 flex-1">
          <div className="grid gap-2 p-4">
            {(activeRun?.stepTrace ?? []).length > 0 ? (
              activeRun?.stepTrace.map((step) => (
                <div
                  className="rounded-md border border-border bg-muted/20 p-3"
                  key={`${activeRun.id}:${step.nodeId}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-sm">{step.nodeId}</p>
                    <span className="text-muted-foreground text-xs">
                      {step.nodeType}
                    </span>
                  </div>
                  <p className="mt-1 text-muted-foreground text-xs">
                    {step.error ?? JSON.stringify(step.output ?? {})}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-sm">
                {t('trace_empty')}
              </p>
            )}
          </div>
        </ScrollArea>
      </div>
    </section>
  );
}
