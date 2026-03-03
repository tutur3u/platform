'use client';

import type { NodeViewProps } from '@tiptap/react';
import { NodeViewContent } from '@tiptap/react';
import { DraggableNodeContainer } from './draggable-node-container';

export function ListItemContent(_props: NodeViewProps) {
  return <NodeViewContent className="min-w-0 flex-1" />;
}

export function ListItemView(props: NodeViewProps) {
  return (
    <DraggableNodeContainer {...props} as="li">
      <ListItemContent {...props} />
    </DraggableNodeContainer>
  );
}
