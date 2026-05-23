'use client';

import { Minimize2, Route, X } from '@tuturuuu/icons';
import type { MindEdge, MindNode } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import type { MindGroupFrame } from './mind-flow';
import { MindInspector } from './mind-inspector';

type Props = {
  edge: MindEdge | null;
  edges: MindEdge[];
  frame: MindGroupFrame | null;
  node: MindNode | null;
  nodes: MindNode[];
  onClose: () => void;
  onDeleteEdge: (edgeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onMinimize: () => void;
  onOpenRelatedView: () => void;
  onSmartPrompt?: (prompt: string) => void;
  onUpdateEdge: (edgeId: string, patch: Partial<MindEdge>) => void;
  onUpdateNode: (nodeId: string, patch: Partial<MindNode>) => void;
};

export function MindCanvasInspectorPanel({
  edge,
  edges,
  frame,
  node,
  nodes,
  onClose,
  onDeleteEdge,
  onDeleteNode,
  onMinimize,
  onOpenRelatedView,
  onSmartPrompt,
  onUpdateEdge,
  onUpdateNode,
}: Props) {
  const t = useTranslations('mind');

  return (
    <div
      className="nowheel nodrag pointer-events-auto absolute left-3 z-50 flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-background/95 shadow-2xl shadow-foreground/10 backdrop-blur"
      onPointerDown={(event) => event.stopPropagation()}
      onWheelCapture={(event) => event.stopPropagation()}
      style={{
        bottom: '1.25rem',
        maxHeight: 'calc(100dvh - 11.25rem)',
        top: '10rem',
        width: 'min(24rem, calc(100vw - 1.5rem))',
      }}
    >
      <div className="flex shrink-0 justify-end gap-1 border-border border-b px-2 py-1.5">
        <Button
          aria-label={t('actions.openRelatedView')}
          className="h-7 w-7"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onOpenRelatedView();
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onOpenRelatedView();
          }}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Route className="h-4 w-4" />
        </Button>
        <Button
          aria-label={t('actions.minimizeInspector')}
          className="h-7 w-7"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onMinimize();
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onMinimize();
          }}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Minimize2 className="h-4 w-4" />
        </Button>
        <Button
          aria-label={t('actions.closeInspector')}
          className="h-7 w-7"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onPointerUp={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div
        className="nowheel nodrag min-h-0 flex-1 overflow-y-auto overscroll-contain"
        onPointerMove={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onWheelCapture={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
      >
        <MindInspector
          edge={edge}
          edges={edges}
          frame={frame}
          node={node}
          nodes={nodes}
          onDeleteEdge={onDeleteEdge}
          onDeleteNode={onDeleteNode}
          onSmartPrompt={onSmartPrompt}
          onUpdateEdge={onUpdateEdge}
          onUpdateNode={onUpdateNode}
        />
      </div>
    </div>
  );
}
