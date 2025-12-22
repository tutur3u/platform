'use client';

import type { NodeViewProps } from '@tiptap/react';
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import { GripVertical } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useState } from 'react';

export type DropZone = 'before' | 'nested' | 'after';

interface DraggableListItemViewProps extends NodeViewProps {
  isTaskItem?: boolean;
}

/**
 * Calculate drop zone based on mouse position relative to target element.
 * Simple 3-zone detection: before (top 25%), nested (middle 50%), after (bottom 75%).
 */
function calculateDropZone(
  event: React.DragEvent,
  targetElement: HTMLElement
): DropZone {
  const rect = targetElement.getBoundingClientRect();
  const relativeY = event.clientY - rect.top;
  const height = rect.height;

  // Top 25% = drop before
  if (relativeY <= height * 0.25) {
    return 'before';
  }

  // Middle 50% = drop nested
  if (relativeY > height * 0.25 && relativeY <= height * 0.75) {
    return 'nested';
  }

  // Bottom 75% = drop after
  return 'after';
}

/**
 * React component for rendering list items with a drag handle.
 * Used by both DraggableListItem and DraggableTaskItem extensions.
 */
export function DraggableListItemView({
  node,
  getPos,
  editor,
  isTaskItem = false,
}: DraggableListItemViewProps) {
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

    event.dataTransfer.setData('application/x-tiptap-list-item', String(pos));
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDropZone(null);
  };

  const handleDragOver = (event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes('application/x-tiptap-list-item')) {
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
      event.dataTransfer.getData('application/x-tiptap-list-item'),
      10
    );
    const targetPos = getPos();

    if (Number.isNaN(sourcePos) || typeof targetPos !== 'number') return;
    if (sourcePos === targetPos) return;

    editor
      .chain()
      .focus()
      .moveListItemToPosition({
        sourcePos,
        targetPos,
        dropZone: finalDropZone,
      })
      .run();
  };

  return (
    <NodeViewWrapper
      as="li"
      className={cn('relative', isTaskItem && 'flex items-start')}
      draggable={false}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-type={isTaskItem ? 'taskItem' : 'listItem'}
      data-drop-zone={dropZone}
    >
      {/* Drag Handle */}
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

      {/* Drop indicator line for before */}
      {dropZone === 'before' && (
        <div className="pointer-events-none absolute -top-px right-0 left-0 h-0.5 bg-dynamic-blue" />
      )}

      {/* Task Item Checkbox (only for task items) */}
      {isTaskItem && (
        <label
          className="mr-2 flex shrink-0 select-none pt-[0.453rem]"
          contentEditable={false}
        >
          <input
            type="checkbox"
            checked={node.attrs.checked}
            onChange={(event) => {
              const pos = getPos();
              if (typeof pos !== 'number') return;

              editor.commands.command(({ tr }) => {
                tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  checked: event.target.checked,
                });
                return true;
              });
            }}
            className={cn(
              'h-4.5 w-4.5 cursor-pointer appearance-none',
              'rounded-lg border-2 border-input bg-background',
              'transition-all duration-150',
              'hover:scale-105 hover:border-dynamic-gray hover:bg-dynamic-gray/10',
              'focus:border-dynamic-gray focus:outline-none focus:ring-2 focus:ring-dynamic-gray/30 focus:ring-offset-2',
              'checked:border-dynamic-gray checked:bg-dynamic-gray/20',
              'checked:bg-center checked:bg-size-[14px_14px] checked:bg-no-repeat',
              // Light mode checkmark
              `checked:bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20fill%3D%22none%22%20stroke%3D%22%2309090b%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%222%22%20d%3D%22M4%208l2.5%202.5L12%205%22%2F%3E%3C%2Fsvg%3E')]`,
              // Dark mode checkmark
              `dark:checked:bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%222%22%20d%3D%22M4%208l2.5%202.5L12%205%22%2F%3E%3C%2Fsvg%3E')]`
            )}
          />
        </label>
      )}

      {/* Content */}
      <NodeViewContent
        className={cn('min-w-0 flex-1', isTaskItem && 'flex-1')}
      />

      {/* Drop indicator line for after */}
      {dropZone === 'after' && (
        <div className="pointer-events-none absolute right-0 -bottom-px left-0 h-0.5 bg-dynamic-blue" />
      )}

      {/* Drop indicator for nested */}
      {dropZone === 'nested' && (
        <div className="pointer-events-none absolute inset-0 ml-6 rounded border-2 border-dynamic-blue border-dashed bg-dynamic-blue/20" />
      )}
    </NodeViewWrapper>
  );
}

/**
 * React component specifically for regular list items (bullet/numbered)
 */
export function ListItemView(props: NodeViewProps) {
  return <DraggableListItemView {...props} isTaskItem={false} />;
}

/**
 * React component specifically for task items (checkbox)
 */
export function TaskItemView(props: NodeViewProps) {
  return <DraggableListItemView {...props} isTaskItem={true} />;
}
