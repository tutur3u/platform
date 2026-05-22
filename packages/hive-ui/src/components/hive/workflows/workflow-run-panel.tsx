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
    <section className="h-full border-border/70 border-t bg-background/92 backdrop-blur-xl">
      <ScrollArea className="h-full min-w-0">
        <div className="grid gap-2 p-3">
          {(activeRun?.stepTrace ?? []).length > 0 ? (
            activeRun?.stepTrace.map((step) => (
              <div
                className="rounded-md border border-border bg-muted/20 p-2.5"
                key={`${activeRun.id}:${step.nodeId}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-sm">{step.nodeId}</p>
                  <div className="flex items-center gap-2">
                    <Badge className="h-5 px-1.5 text-[11px]" variant="outline">
                      {step.status}
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      {step.nodeType}
                    </span>
                  </div>
                </div>
                <p className="mt-1 line-clamp-2 text-muted-foreground text-xs">
                  {step.error ?? JSON.stringify(step.output ?? {})}
                </p>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">
              {activeRun ? t('trace_empty') : t('empty')}
            </p>
          )}
        </div>
      </ScrollArea>
    </section>
  );
}
