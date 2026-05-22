'use client';

import { GitMerge, ListChecks, Sparkles } from '@tuturuuu/icons';
import type { MindAiPatchRecord } from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';

type Props = {
  applying?: boolean;
  patch: MindAiPatchRecord;
  onApplyPatch: (patchId: string) => void;
};

export function MindAiPatchDraftCard({ applying, patch, onApplyPatch }: Props) {
  const t = useTranslations('mind');
  const operations = patch.patch.operations;
  const counts = operations.reduce<Record<string, number>>((acc, operation) => {
    acc[operation.kind] = (acc[operation.kind] ?? 0) + 1;
    return acc;
  }, {});
  const highlights = operations
    .slice(0, 4)
    .map((operation) => getOperationLabel(operation))
    .filter(Boolean);
  const canApply = patch.status === 'draft';
  const isApplied = patch.status === 'applied';

  return (
    <section
      className={
        isApplied
          ? 'rounded-lg border border-dynamic-green/25 bg-dynamic-green/5 p-3'
          : 'rounded-lg border border-dynamic-blue/25 bg-dynamic-blue/5 p-3'
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h3 className="truncate font-medium text-sm">{patch.summary}</h3>
              <p className="text-muted-foreground text-xs">
                {t('ai.patchOps', { count: operations.length })}
              </p>
            </div>
          </div>
          {highlights.length ? (
            <div className="mt-3 grid gap-1.5">
              {highlights.map((label) => (
                <div
                  className="flex items-center gap-2 rounded-md border border-border/70 bg-background/60 px-2 py-1.5 text-xs"
                  key={label}
                >
                  <ListChecks className="h-3.5 w-3.5 text-dynamic-blue" />
                  <span className="min-w-0 truncate">{label}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Badge variant={canApply ? 'secondary' : 'outline'}>
            {canApply
              ? t('ai.draft')
              : isApplied
                ? t('ai.applied')
                : patch.status}
          </Badge>
          {canApply ? (
            <Button
              className="gap-1.5"
              disabled={applying}
              onClick={() => onApplyPatch(patch.id)}
              size="sm"
              type="button"
            >
              <GitMerge className="h-3.5 w-3.5" />
              {t('ai.applyDraft')}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {Object.entries(counts).map(([kind, count]) => (
          <Badge className="font-mono text-[10px]" key={kind} variant="outline">
            {kind.replaceAll('_', ' ')} · {count}
          </Badge>
        ))}
      </div>
    </section>
  );
}

function getOperationLabel(
  operation: MindAiPatchRecord['patch']['operations'][number]
) {
  if (operation.kind === 'create_node') return operation.node.title;
  if (operation.kind === 'update_node')
    return operation.title ?? operation.nodeId;
  if (operation.kind === 'create_edge') {
    return (
      operation.edge.label ??
      `${operation.edge.sourceNodeId} -> ${operation.edge.targetNodeId}`
    );
  }
  if (operation.kind === 'update_edge')
    return operation.label ?? operation.edgeId;
  if (operation.kind === 'delete_node') return operation.nodeId;
  return operation.edgeId;
}
