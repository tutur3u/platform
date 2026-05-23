'use client';

import {
  GitMerge,
  ListChecks,
  Pencil,
  Plus,
  Route,
  Sparkles,
  Trash2,
} from '@tuturuuu/icons';
import type { MindAiPatchRecord } from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';

type Props = {
  applying?: boolean;
  patch: MindAiPatchRecord;
  onApplyPatch: (patchId: string) => void;
  showApplyAction?: boolean;
};

export function MindAiPatchDraftCard({
  applying,
  patch,
  onApplyPatch,
  showApplyAction = true,
}: Props) {
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
  const preview = getPatchFlowPreview(patch);

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
          {canApply && showApplyAction ? (
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
      <MindPatchFlowPreview preview={preview} />
    </section>
  );
}

function MindPatchFlowPreview({
  preview,
}: {
  preview: ReturnType<typeof getPatchFlowPreview>;
}) {
  const t = useTranslations('mind');
  if (!preview.nodes.length && !preview.edges.length) return null;

  return (
    <fieldset className="mt-3 rounded-lg border border-border/70 bg-background/70 p-2">
      <legend className="sr-only">{t('ai.patchPreview')}</legend>
      <div className="grid gap-1.5">
        {preview.edges.slice(0, 4).map((edge) => (
          <div
            className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 text-[10px]"
            key={edge.id}
          >
            <PreviewNode label={edge.source} tone={edge.sourceTone} />
            <div className="flex min-w-0 flex-col items-center gap-0.5 text-muted-foreground">
              <Route className="h-3.5 w-3.5" />
              <span className="max-w-20 truncate font-medium">
                {edge.label}
              </span>
            </div>
            <PreviewNode label={edge.target} tone={edge.targetTone} />
          </div>
        ))}
        {preview.nodes.slice(0, 5).map((node) => (
          <div
            className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-1.5 rounded-md border border-border/60 bg-card/60 px-2 py-1.5"
            key={node.id}
          >
            <PreviewIcon tone={node.tone} />
            <span className="truncate text-xs">{node.label}</span>
          </div>
        ))}
      </div>
      {preview.hiddenCount > 0 ? (
        <p className="mt-2 text-[10px] text-muted-foreground">
          {t('ai.moreOperations', { count: preview.hiddenCount })}
        </p>
      ) : null}
    </fieldset>
  );
}

function PreviewNode({ label, tone }: { label: string; tone: PreviewTone }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 rounded-md border border-border/60 bg-card/70 px-2 py-1.5">
      <PreviewIcon tone={tone} />
      <span className="truncate text-xs">{label}</span>
    </div>
  );
}

function PreviewIcon({ tone }: { tone: PreviewTone }) {
  const Icon = tone === 'create' ? Plus : tone === 'delete' ? Trash2 : Pencil;

  return (
    <span
      className={cn(
        'flex h-5 w-5 shrink-0 items-center justify-center rounded border',
        tone === 'create' &&
          'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green',
        tone === 'update' &&
          'border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue',
        tone === 'delete' &&
          'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red'
      )}
    >
      <Icon className="h-3 w-3" />
    </span>
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

type PreviewTone = 'create' | 'delete' | 'update';

function getPatchFlowPreview(patch: MindAiPatchRecord) {
  const nodeLabels = new Map<string, { label: string; tone: PreviewTone }>();
  const standaloneNodes: Array<{
    id: string;
    label: string;
    tone: PreviewTone;
  }> = [];
  const edges: Array<{
    id: string;
    label: string;
    source: string;
    sourceTone: PreviewTone;
    target: string;
    targetTone: PreviewTone;
  }> = [];

  for (const operation of patch.patch.operations) {
    if (operation.kind === 'create_node') {
      const item = {
        label: operation.node.title,
        tone: 'create' as const,
      };
      nodeLabels.set(operation.id, item);
      nodeLabels.set(operation.node.id, item);
      standaloneNodes.push({
        id: operation.id,
        ...item,
      });
      continue;
    }

    if (operation.kind === 'update_node') {
      const item = {
        label: operation.title ?? shortId(operation.nodeId),
        tone: 'update' as const,
      };
      nodeLabels.set(operation.nodeId, item);
      standaloneNodes.push({
        id: operation.id,
        ...item,
      });
      continue;
    }

    if (operation.kind === 'delete_node') {
      const item = {
        label: shortId(operation.nodeId),
        tone: 'delete' as const,
      };
      nodeLabels.set(operation.nodeId, item);
      standaloneNodes.push({
        id: operation.id,
        ...item,
      });
      continue;
    }

    if (operation.kind === 'create_edge') {
      const source = getPreviewNodeLabel(
        nodeLabels,
        operation.edge.sourceNodeId
      );
      const target = getPreviewNodeLabel(
        nodeLabels,
        operation.edge.targetNodeId
      );
      edges.push({
        id: operation.id,
        label:
          operation.edge.label ??
          operation.edge.edgeType?.replaceAll('_', ' ') ??
          operation.id,
        source: source.label,
        sourceTone: source.tone,
        target: target.label,
        targetTone: target.tone,
      });
    }
  }

  const connectedLabels = new Set(
    edges.flatMap((edge) => [edge.source, edge.target])
  );
  const nodes = standaloneNodes.filter(
    (node) => !connectedLabels.has(node.label)
  );
  const visibleCount = Math.min(edges.length, 4) + Math.min(nodes.length, 5);
  const totalCount = edges.length + nodes.length;

  return {
    edges,
    hiddenCount: Math.max(0, totalCount - visibleCount),
    nodes,
  };
}

function getPreviewNodeLabel(
  nodeLabels: Map<string, { label: string; tone: PreviewTone }>,
  nodeId: string
) {
  return nodeLabels.get(nodeId) ?? { label: shortId(nodeId), tone: 'update' };
}

function shortId(id: string) {
  return id.length > 10 ? `${id.slice(0, 8)}...` : id;
}
