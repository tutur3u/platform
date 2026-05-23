'use client';

import { Route, X } from '@tuturuuu/icons';
import type { MindEdge, MindNode } from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';

type Props = {
  edge: MindEdge | null;
  edges: MindEdge[];
  node: MindNode | null;
  nodes: MindNode[];
  onClose: () => void;
  onSelectEdge: (edgeId: string) => void;
  onSelectNode: (nodeId: string) => void;
};

export function MindRelatedViewIsland({
  edge,
  edges,
  node,
  nodes,
  onClose,
  onSelectEdge,
  onSelectNode,
}: Props) {
  const t = useTranslations('mind');
  const nodeById = new Map(nodes.map((item) => [item.id, item]));
  const relatedEdges = edge
    ? [edge]
    : node
      ? edges.filter(
          (item) =>
            item.sourceNodeId === node.id || item.targetNodeId === node.id
        )
      : [];
  const relatedNodeIds = new Set<string>();

  if (node) relatedNodeIds.add(node.id);
  for (const item of relatedEdges) {
    relatedNodeIds.add(item.sourceNodeId);
    relatedNodeIds.add(item.targetNodeId);
  }

  const relatedNodes = [...relatedNodeIds]
    .map((id) => nodeById.get(id))
    .filter((item): item is MindNode => Boolean(item));
  const title =
    node?.title ||
    edge?.label ||
    (edge ? t(`edgeTypes.${edge.edgeType}`) : t('inspector.relatedView'));

  if (!node && !edge) return null;

  return (
    <aside
      className="nowheel nodrag pointer-events-auto absolute top-40 right-5 z-40 flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-background/95 shadow-2xl shadow-foreground/10 backdrop-blur"
      onPointerDown={(event) => event.stopPropagation()}
      onWheelCapture={(event) => event.stopPropagation()}
      style={{
        maxHeight: 'min(34rem, calc(100dvh - 11rem))',
        width: 'min(28rem, calc(100vw - 1.5rem))',
      }}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-border border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Route className="h-4 w-4 shrink-0 text-dynamic-blue" />
          <div className="min-w-0">
            <h2 className="truncate font-semibold text-sm tracking-normal">
              {t('inspector.relatedView')}
            </h2>
            <p className="truncate text-muted-foreground text-xs">{title}</p>
          </div>
        </div>
        <Button
          aria-label={t('actions.closeRelatedView')}
          className="h-7 w-7 shrink-0"
          onClick={onClose}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div
        className="nowheel nodrag min-h-0 flex-1 overflow-y-auto overscroll-contain p-3"
        onPointerDown={(event) => event.stopPropagation()}
        onPointerMove={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
        onWheelCapture={(event) => event.stopPropagation()}
      >
        <section className="space-y-2">
          <h3 className="font-medium text-muted-foreground text-xs">
            {t('inspector.relatedNodes')}
          </h3>
          <div className="grid gap-1.5">
            {relatedNodes.map((item) => (
              <RelatedNodeRow
                key={item.id}
                node={item}
                onSelect={onSelectNode}
                selected={item.id === node?.id}
              />
            ))}
          </div>
        </section>
        <section className="mt-4 space-y-2">
          <h3 className="font-medium text-muted-foreground text-xs">
            {t('inspector.relatedRelationships')}
          </h3>
          {relatedEdges.length ? (
            <div className="grid gap-1.5">
              {relatedEdges.map((item) => (
                <RelatedEdgeRow
                  edge={item}
                  key={item.id}
                  nodes={nodeById}
                  onSelect={onSelectEdge}
                  selected={item.id === edge?.id}
                />
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-muted-foreground text-xs">
              {t('inspector.noRelatedRelationships')}
            </p>
          )}
        </section>
      </div>
    </aside>
  );
}

function RelatedNodeRow({
  node,
  onSelect,
  selected,
}: {
  node: MindNode;
  onSelect: (nodeId: string) => void;
  selected: boolean;
}) {
  const t = useTranslations('mind');

  return (
    <button
      className={cn(
        'w-full rounded-md border border-border bg-card/70 px-3 py-2 text-left transition hover:border-dynamic-blue/60 hover:bg-muted/40',
        selected && 'border-dynamic-blue bg-dynamic-blue/10'
      )}
      onClick={() => onSelect(node.id)}
      type="button"
    >
      <div className="truncate font-medium text-sm">{node.title}</div>
      <div className="mt-1 flex flex-wrap gap-1">
        <Badge className="text-[10px]" variant="secondary">
          {t(`nodeTypes.${node.nodeType}`)}
        </Badge>
        <Badge className="text-[10px]" variant="outline">
          {t(`nodeStatuses.${node.status}`)}
        </Badge>
        <Badge className="text-[10px]" variant="outline">
          {t(`horizons.${node.horizon}`)}
        </Badge>
      </div>
    </button>
  );
}

function RelatedEdgeRow({
  edge,
  nodes,
  onSelect,
  selected,
}: {
  edge: MindEdge;
  nodes: Map<string, MindNode>;
  onSelect: (edgeId: string) => void;
  selected: boolean;
}) {
  const t = useTranslations('mind');
  const source = nodes.get(edge.sourceNodeId);
  const target = nodes.get(edge.targetNodeId);

  return (
    <button
      className={cn(
        'w-full rounded-md border border-border bg-card/70 px-3 py-2 text-left transition hover:border-dynamic-blue/60 hover:bg-muted/40',
        selected && 'border-dynamic-blue bg-dynamic-blue/10'
      )}
      onClick={() => onSelect(edge.id)}
      type="button"
    >
      <div className="flex min-w-0 items-center gap-2">
        <Badge className="shrink-0 text-[10px]" variant="outline">
          {t(`edgeTypes.${edge.edgeType}`)}
        </Badge>
        <span className="min-w-0 truncate font-medium text-xs">
          {edge.label || t(`edgeTypes.${edge.edgeType}`)}
        </span>
      </div>
      <p className="mt-1 truncate text-muted-foreground text-xs">
        {source?.title ?? edge.sourceNodeId}
        {' -> '}
        {target?.title ?? edge.targetNodeId}
      </p>
    </button>
  );
}
