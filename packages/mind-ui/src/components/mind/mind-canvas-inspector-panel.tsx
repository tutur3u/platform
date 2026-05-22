'use client';

import { X } from '@tuturuuu/icons';
import type { MindEdge, MindNode } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { MindInspector } from './mind-inspector';

type Props = {
  edge: MindEdge | null;
  edges: MindEdge[];
  node: MindNode | null;
  nodes: MindNode[];
  onClose: () => void;
  onDeleteEdge: (edgeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onSmartPrompt?: (prompt: string) => void;
  onUpdateEdge: (edgeId: string, patch: Partial<MindEdge>) => void;
  onUpdateNode: (nodeId: string, patch: Partial<MindNode>) => void;
};

export function MindCanvasInspectorPanel({
  edge,
  edges,
  node,
  nodes,
  onClose,
  onDeleteEdge,
  onDeleteNode,
  onSmartPrompt,
  onUpdateEdge,
  onUpdateNode,
}: Props) {
  const t = useTranslations('mind');

  return (
    <div className="pointer-events-auto absolute top-48 left-3 z-40 max-h-[calc(100%-13rem)] w-[min(23rem,calc(100vw-1.5rem))] overflow-y-auto rounded-xl border border-border bg-background/95 shadow-2xl shadow-foreground/10 backdrop-blur">
      <Button
        aria-label={t('actions.closeInspector')}
        className="absolute top-2 right-2 z-10 h-7 w-7"
        onClick={onClose}
        size="icon"
        type="button"
        variant="ghost"
      >
        <X className="h-4 w-4" />
      </Button>
      <MindInspector
        edge={edge}
        edges={edges}
        node={node}
        nodes={nodes}
        onDeleteEdge={onDeleteEdge}
        onDeleteNode={onDeleteNode}
        onSmartPrompt={onSmartPrompt}
        onUpdateEdge={onUpdateEdge}
        onUpdateNode={onUpdateNode}
      />
    </div>
  );
}
