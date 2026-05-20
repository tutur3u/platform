'use client';

import type { MindEdge, MindNode } from '@tuturuuu/types/db';
import { useTranslations } from 'next-intl';
import { MindEdgeInspector } from './mind-edge-inspector';
import { MindNodeInspector } from './mind-node-inspector';

type Props = {
  edge: MindEdge | null;
  edges: MindEdge[];
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

  return (
    <section className="p-4 text-muted-foreground text-sm">
      {t('inspector.empty')}
    </section>
  );
}
