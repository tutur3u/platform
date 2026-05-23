'use client';

import type { MindEdge, MindNode } from '@tuturuuu/types/db';
import { Badge } from '@tuturuuu/ui/badge';
import { useTranslations } from 'next-intl';
import { MindEdgeInspector } from './mind-edge-inspector';
import type { MindGroupFrame } from './mind-flow';
import { MindNodeInspector } from './mind-node-inspector';

type Props = {
  edge: MindEdge | null;
  edges: MindEdge[];
  frame: MindGroupFrame | null;
  node: MindNode | null;
  nodes: MindNode[];
  onDeleteEdge: (edgeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onSmartPrompt?: (prompt: string) => void;
  onUpdateEdge: (edgeId: string, patch: Partial<MindEdge>) => void;
  onUpdateNode: (nodeId: string, patch: Partial<MindNode>) => void;
};

export function MindInspector({
  edge,
  edges,
  frame,
  node,
  nodes,
  onDeleteEdge,
  onDeleteNode,
  onSmartPrompt,
  onUpdateEdge,
  onUpdateNode,
}: Props) {
  const t = useTranslations('mind');

  if (node) {
    return (
      <MindNodeInspector
        node={node}
        edges={edges}
        nodes={nodes}
        onDeleteNode={onDeleteNode}
        onSmartPrompt={onSmartPrompt}
        onUpdateNode={onUpdateNode}
      />
    );
  }

  if (edge) {
    return (
      <MindEdgeInspector
        edge={edge}
        nodes={nodes}
        onDeleteEdge={onDeleteEdge}
        onSmartPrompt={onSmartPrompt}
        onUpdateEdge={onUpdateEdge}
      />
    );
  }

  if (frame) {
    return <MindFrameInspector frame={frame} nodes={nodes} />;
  }

  return (
    <section className="p-4 text-muted-foreground text-sm">
      {t('inspector.empty')}
    </section>
  );
}

function MindFrameInspector({
  frame,
  nodes,
}: {
  frame: MindGroupFrame;
  nodes: MindNode[];
}) {
  const t = useTranslations('mind');
  const anchor = nodes.find((node) => node.id === frame.anchorNodeId);
  const title =
    frame.kind === 'children' ? t('inspector.group') : t('inspector.cluster');

  return (
    <section className="space-y-3 p-3">
      <div className="flex items-start justify-between gap-4 pr-9">
        <div className="min-w-0">
          <h2 className="truncate font-semibold text-base tracking-normal">
            {title}
          </h2>
          <Badge
            className="mt-2 max-w-full truncate"
            style={{
              borderColor: frame.color,
              color: frame.color,
            }}
            variant="outline"
          >
            {frame.title || frame.parentTitle || title}
          </Badge>
        </div>
      </div>
      <div className="grid gap-2 rounded-lg border border-border bg-muted/30 p-2 text-xs">
        <FrameDetail label={t('inspector.children')} value={frame.childCount} />
        <FrameDetail
          label={t('inspector.anchor')}
          value={anchor?.title || frame.parentTitle || t('none')}
        />
        <FrameDetail
          label={t('fields.type')}
          value={
            frame.kind === 'children'
              ? t('inspector.group')
              : t('inspector.cluster')
          }
        />
      </div>
    </section>
  );
}

function FrameDetail({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate font-medium">{value}</span>
    </div>
  );
}
