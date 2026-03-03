'use client';

import type { NodeViewProps } from '@tiptap/react';
import { NodeViewWrapper } from '@tiptap/react';
import { GripVertical } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useState } from 'react';

export type DropZone = 'before' | 'nested' | 'after';

interface DraggableNodeContainerProps extends NodeViewProps {
  as?: 'li' | 'div';
  className?: string;
  children: React.ReactNode;
}

function calculateDropZone(
  event: React.DragEvent,
  targetElement: HTMLElement
): DropZone {
  const rect = targetElement.getBoundingClientRect();
  const relativeY = event.clientY - rect.top;
  const height = rect.height;

  if (relativeY <= height * 0.25) {
    return 'before';
  }

  if (relativeY > height * 0.25 && relativeY <= height * 0.75) {
    return 'nested';
  }

  return 'after';
}

export function DraggableNodeContainer({
  getPos,
  editor,
  as = 'li',
  className,
  children,
}: DraggableNodeContainerProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [dropZone, setDropZone] = useState<DropZone | null>(null);

  const handleMouseEnter = (event: React.MouseEvent) => {
    event.stopPropagation();
    setIsHovered(true);
  };

  const handleMouseLeave = (event: React.MouseEvent) => {
    event.stopPropagation();
    setIsHovered(false);
  };

  const handleDragStart = (event: React.DragEvent) => {
    const pos = getPos();
    if (typeof pos !== 'number') return;

    event.dataTransfer.setData(
      'application/x-tiptap-draggable-node',
      String(pos)
    );
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDropZone(null);
  };

  const handleDragOver = (event: React.DragEvent) => {
    if (
      !event.dataTransfer.types.includes('application/x-tiptap-draggable-node')
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';

    const calculatedZone = calculateDropZone(
      event,
      event.currentTarget as HTMLElement
    );
    setDropZone(calculatedZone);
  };

  const handleDragLeave = () => {
    setDropZone(null);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const finalDropZone =
      dropZone || calculateDropZone(event, event.currentTarget as HTMLElement);

    setDropZone(null);

    const sourcePos = parseInt(
      event.dataTransfer.getData('application/x-tiptap-draggable-node'),
      10
    );
    const targetPos = getPos();

    if (Number.isNaN(sourcePos) || typeof targetPos !== 'number') return;
    if (sourcePos === targetPos) return;

    editor
      .chain()
      .focus()
      .moveNodeToPosition({
        sourcePos,
        targetPos,
        dropZone: finalDropZone,
      })
      .run();
  };

  return (
    <NodeViewWrapper
      as={as}
      className={cn('relative', className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className={cn(
          'absolute top-[0.4rem] -left-6',
          'flex h-5 w-5 cursor-grab items-center justify-center',
          'rounded transition-opacity',
          'text-muted-foreground hover:bg-accent hover:text-foreground',
          'active:cursor-grabbing',
          isHovered ? 'opacity-100' : 'opacity-0'
        )}
        contentEditable={false}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        draggable={true}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </div>

      {dropZone === 'before' && (
        <div className="pointer-events-none absolute -top-px right-0 left-0 h-0.5 bg-dynamic-blue" />
      )}

      {children}

      {dropZone === 'after' && (
        <div className="pointer-events-none absolute right-0 -bottom-px left-0 h-0.5 bg-dynamic-blue" />
      )}

      {dropZone === 'nested' && (
        <div className="pointer-events-none absolute inset-0 rounded border-2 border-dynamic-blue border-dashed bg-dynamic-blue/20" />
      )}
    </NodeViewWrapper>
  );
}
