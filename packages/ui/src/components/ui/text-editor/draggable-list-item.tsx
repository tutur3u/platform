'use client';

import { useQuery } from '@tanstack/react-query';
import type { NodeViewProps } from '@tiptap/react';
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import { GripVertical } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import { cn } from '@tuturuuu/utils/format';
import { useCallback, useMemo, useState } from 'react';

export type DropZone = 'before' | 'nested' | 'after';

interface DraggableListItemViewProps extends NodeViewProps {
  isTaskItem?: boolean;
}

/**
 * Extract all task mention entity IDs from a ProseMirror node's content.
 * Recursively traverses the node tree to find mention nodes with entityType='task'.
 */
function extractTaskMentionIds(node: NodeViewProps['node']): string[] {
  const taskIds: string[] = [];

  node.descendants((childNode) => {
    if (
      childNode.type.name === 'mention' &&
      childNode.attrs.entityType === 'task' &&
      childNode.attrs.entityId
    ) {
      taskIds.push(childNode.attrs.entityId);
    }
    return true; // Continue traversing
  });

  return taskIds;
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
  // Track if user has manually overridden the checkbox state
  const [manualOverride, setManualOverride] = useState<boolean | null>(null);
  const supabase = createClient();

  // Extract task mention IDs from this node's content
  const taskMentionIds = useMemo(() => {
    if (!isTaskItem) return [];
    return extractTaskMentionIds(node);
  }, [node, isTaskItem]);

  // Fetch task completion statuses for mentioned tasks
  const { data: mentionedTasks } = useQuery({
    queryKey: ['task-list-item-mentions', ...taskMentionIds.sort()],
    queryFn: async () => {
      if (taskMentionIds.length === 0) return [];
      const { data, error } = await supabase
        .from('tasks')
        .select('id, closed_at, list_id, task_lists!inner(status, color)')
        .in('id', taskMentionIds);

      if (error) throw error;
      return (data || []) as Array<{
        id: string;
        closed_at: string | null;
        list_id: string;
        task_lists: { status: string | null; color: string | null };
      }>;
    },
    enabled: taskMentionIds.length > 0,
    staleTime: 10000, // 10 seconds
    refetchOnWindowFocus: false,
  });

  // Compute if all mentioned tasks are done/closed
  const allMentionedTasksCompleted = useMemo(() => {
    if (!mentionedTasks || mentionedTasks.length === 0) return false;
    // All tasks must have closed_at set OR be in a done/closed list
    return mentionedTasks.every((task) => {
      const listStatus = task.task_lists?.status;
      return (
        task.closed_at !== null ||
        listStatus === 'done' ||
        listStatus === 'closed'
      );
    });
  }, [mentionedTasks]);

  // Get the dominant color from completed tasks for checkbox styling
  const completedTaskColor = useMemo(() => {
    if (!mentionedTasks || mentionedTasks.length === 0) return null;
    // Find the first task with a color
    const taskWithColor = mentionedTasks.find((t) => t.task_lists?.color);
    return taskWithColor?.task_lists?.color?.toLowerCase() || null;
  }, [mentionedTasks]);

  // Determine if checkbox should show as checked
  // Priority: manual override > node.attrs.checked > auto-complete based on mentions
  const isChecked = useMemo(() => {
    if (manualOverride !== null) return manualOverride;
    if (node.attrs.checked !== undefined) return node.attrs.checked;
    return allMentionedTasksCompleted;
  }, [manualOverride, node.attrs.checked, allMentionedTasksCompleted]);

  const handleCheckboxChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!editor.isEditable) return;

      const pos = getPos();
      if (typeof pos !== 'number') return;

      const newChecked = event.target.checked;
      setManualOverride(newChecked);

      editor.commands.command(({ tr }) => {
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          checked: newChecked,
        });
        return true;
      });
    },
    [editor, getPos, node.attrs]
  );

  // Prevent click events when read-only
  const handleCheckboxClick = useCallback(
    (event: React.MouseEvent) => {
      if (!editor.isEditable) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    [editor]
  );

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
          className={cn(
            'task-list-checkbox-label mr-2 flex shrink-0 select-none pt-[0.453rem]',
            !editor.isEditable && 'pointer-events-none'
          )}
          contentEditable={false}
        >
          <input
            type="checkbox"
            checked={isChecked}
            disabled={!editor.isEditable}
            onChange={handleCheckboxChange}
            onClick={handleCheckboxClick}
            className={cn(
              'task-list-checkbox h-4.5 w-4.5 cursor-pointer appearance-none',
              'rounded-lg border-2 bg-background',
              'transition-all duration-150',
              'checked:bg-center checked:bg-size-[14px_14px] checked:bg-no-repeat',
              // Default styles (no task mentions or no color)
              !completedTaskColor && [
                'border-input',
                'hover:scale-105 hover:border-dynamic-gray hover:bg-dynamic-gray/10',
                'focus:border-dynamic-gray focus:outline-none focus:ring-2 focus:ring-dynamic-gray/30 focus:ring-offset-2',
                'checked:border-dynamic-gray checked:bg-dynamic-gray/20',
              ],
              // Dynamic color styles when tasks have a color
              completedTaskColor === 'red' && [
                'border-dynamic-red/50',
                'hover:scale-105 hover:border-dynamic-red hover:bg-dynamic-red/10',
                'focus:border-dynamic-red focus:outline-none focus:ring-2 focus:ring-dynamic-red/30 focus:ring-offset-2',
                'checked:border-dynamic-red checked:bg-dynamic-red/20',
              ],
              completedTaskColor === 'orange' && [
                'border-dynamic-orange/50',
                'hover:scale-105 hover:border-dynamic-orange hover:bg-dynamic-orange/10',
                'focus:border-dynamic-orange focus:outline-none focus:ring-2 focus:ring-dynamic-orange/30 focus:ring-offset-2',
                'checked:border-dynamic-orange checked:bg-dynamic-orange/20',
              ],
              completedTaskColor === 'yellow' && [
                'border-dynamic-yellow/50',
                'hover:scale-105 hover:border-dynamic-yellow hover:bg-dynamic-yellow/10',
                'focus:border-dynamic-yellow focus:outline-none focus:ring-2 focus:ring-dynamic-yellow/30 focus:ring-offset-2',
                'checked:border-dynamic-yellow checked:bg-dynamic-yellow/20',
              ],
              completedTaskColor === 'green' && [
                'border-dynamic-green/50',
                'hover:scale-105 hover:border-dynamic-green hover:bg-dynamic-green/10',
                'focus:border-dynamic-green focus:outline-none focus:ring-2 focus:ring-dynamic-green/30 focus:ring-offset-2',
                'checked:border-dynamic-green checked:bg-dynamic-green/20',
              ],
              completedTaskColor === 'cyan' && [
                'border-dynamic-cyan/50',
                'hover:scale-105 hover:border-dynamic-cyan hover:bg-dynamic-cyan/10',
                'focus:border-dynamic-cyan focus:outline-none focus:ring-2 focus:ring-dynamic-cyan/30 focus:ring-offset-2',
                'checked:border-dynamic-cyan checked:bg-dynamic-cyan/20',
              ],
              completedTaskColor === 'blue' && [
                'border-dynamic-blue/50',
                'hover:scale-105 hover:border-dynamic-blue hover:bg-dynamic-blue/10',
                'focus:border-dynamic-blue focus:outline-none focus:ring-2 focus:ring-dynamic-blue/30 focus:ring-offset-2',
                'checked:border-dynamic-blue checked:bg-dynamic-blue/20',
              ],
              completedTaskColor === 'purple' && [
                'border-dynamic-purple/50',
                'hover:scale-105 hover:border-dynamic-purple hover:bg-dynamic-purple/10',
                'focus:border-dynamic-purple focus:outline-none focus:ring-2 focus:ring-dynamic-purple/30 focus:ring-offset-2',
                'checked:border-dynamic-purple checked:bg-dynamic-purple/20',
              ],
              completedTaskColor === 'pink' && [
                'border-dynamic-pink/50',
                'hover:scale-105 hover:border-dynamic-pink hover:bg-dynamic-pink/10',
                'focus:border-dynamic-pink focus:outline-none focus:ring-2 focus:ring-dynamic-pink/30 focus:ring-offset-2',
                'checked:border-dynamic-pink checked:bg-dynamic-pink/20',
              ],
              // Light mode checkmark
              `checked:bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20fill%3D%22none%22%20stroke%3D%22%2309090b%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%222%22%20d%3D%22M4%208l2.5%202.5L12%205%22%2F%3E%3C%2Fsvg%3E')]`,
              // Dark mode checkmark
              `dark:checked:bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%222%22%20d%3D%22M4%208l2.5%202.5L12%205%22%2F%3E%3C%2Fsvg%3E')]`
            )}
          />
        </label>
      )}

      {/* Content - with lower opacity when checked (if fade setting is enabled via body data attribute) */}
      {/* The fade effect is controlled via CSS: [data-fade-completed="true"] .task-content-faded { opacity: 0.5 } */}
      <NodeViewContent
        className={cn(
          'min-w-0 flex-1 transition-opacity duration-150',
          isTaskItem && 'flex-1',
          // Apply 'task-content-faded' class when checked
          // CSS will only apply opacity when document.body has data-fade-completed="true"
          // This avoids React state changes which cause editor re-render issues
          isTaskItem && isChecked && 'task-content-faded'
        )}
      />

      {/* Drop indicator line for after */}
      {dropZone === 'after' && (
        <div className="pointer-events-none absolute right-0 -bottom-px left-0 h-0.5 bg-dynamic-blue" />
      )}

      {/* Drop indicator for nested */}
      {dropZone === 'nested' && (
        <div className="pointer-events-none absolute inset-0 rounded border-2 border-dynamic-blue border-dashed bg-dynamic-blue/20" />
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
