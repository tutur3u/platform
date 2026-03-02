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
  // Supports tri-state: false (unchecked), 'indeterminate', true (checked)
  const [manualOverride, setManualOverride] = useState<
    boolean | 'indeterminate' | null
  >(null);
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

  // Determine checkbox state (tri-state: false | 'indeterminate' | true)
  // Priority: manual override > node.attrs.checked > auto-complete based on mentions
  const checkboxState = useMemo((): boolean | 'indeterminate' => {
    if (manualOverride !== null) return manualOverride;
    const attrChecked = node.attrs.checked;
    if (attrChecked === 'indeterminate') return 'indeterminate';
    if (attrChecked !== undefined) return !!attrChecked;
    return allMentionedTasksCompleted;
  }, [manualOverride, node.attrs.checked, allMentionedTasksCompleted]);

  const isChecked = checkboxState === true;
  const isIndeterminate = checkboxState === 'indeterminate';

  // Cycle: unchecked -> indeterminate -> checked -> unchecked
  const handleCheckboxCycle = useCallback(() => {
    if (!editor.isEditable) return;

    const pos = getPos();
    if (typeof pos !== 'number') return;

    let nextState: boolean | 'indeterminate';
    if (checkboxState === false) {
      nextState = 'indeterminate';
    } else if (checkboxState === 'indeterminate') {
      nextState = true;
    } else {
      nextState = false;
    }

    setManualOverride(nextState);

    editor.commands.command(({ tr }) => {
      tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        checked: nextState,
      });
      return true;
    });
  }, [editor, getPos, node.attrs, checkboxState]);

  // Prevent default checkbox change and use our cycle handler
  const handleCheckboxClick = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (!editor.isEditable) return;
      handleCheckboxCycle();
    },
    [editor, handleCheckboxCycle]
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
        <div
          className={cn(
            'task-list-checkbox-label relative mr-2 flex shrink-0 select-none pt-[0.453rem]',
            !editor.isEditable && 'pointer-events-none'
          )}
          contentEditable={false}
        >
          <button
            type="button"
            aria-label={
              isChecked
                ? 'Checked'
                : isIndeterminate
                  ? 'Indeterminate'
                  : 'Unchecked'
            }
            disabled={!editor.isEditable}
            onClick={handleCheckboxClick}
            className={cn(
              'task-list-checkbox flex h-4.5 w-4.5 items-center justify-center',
              'cursor-pointer rounded-lg border-2 bg-background',
              'transition-all duration-150',
              // Default styles (no task mentions or no color)
              !completedTaskColor && [
                'border-input',
                'hover:scale-105 hover:border-dynamic-gray hover:bg-dynamic-gray/10',
                'focus:border-dynamic-gray focus:outline-none focus:ring-2 focus:ring-dynamic-gray/30 focus:ring-offset-2',
                isChecked &&
                  'border-dynamic-green bg-dynamic-green/20 hover:border-dynamic-green hover:bg-dynamic-green/10 focus:border-dynamic-green focus:ring-dynamic-green/30',
                isIndeterminate &&
                  'border-dynamic-orange bg-dynamic-orange/20 hover:border-dynamic-orange hover:bg-dynamic-orange/10 focus:border-dynamic-orange focus:ring-dynamic-orange/30',
              ],
              // Dynamic color styles when tasks have a color
              completedTaskColor === 'red' && [
                'border-dynamic-red/50',
                'hover:scale-105 hover:border-dynamic-red hover:bg-dynamic-red/10',
                'focus:border-dynamic-red focus:outline-none focus:ring-2 focus:ring-dynamic-red/30 focus:ring-offset-2',
                (isChecked || isIndeterminate) &&
                  'border-dynamic-red bg-dynamic-red/20',
              ],
              completedTaskColor === 'orange' && [
                'border-dynamic-orange/50',
                'hover:scale-105 hover:border-dynamic-orange hover:bg-dynamic-orange/10',
                'focus:border-dynamic-orange focus:outline-none focus:ring-2 focus:ring-dynamic-orange/30 focus:ring-offset-2',
                (isChecked || isIndeterminate) &&
                  'border-dynamic-orange bg-dynamic-orange/20',
              ],
              completedTaskColor === 'yellow' && [
                'border-dynamic-yellow/50',
                'hover:scale-105 hover:border-dynamic-yellow hover:bg-dynamic-yellow/10',
                'focus:border-dynamic-yellow focus:outline-none focus:ring-2 focus:ring-dynamic-yellow/30 focus:ring-offset-2',
                (isChecked || isIndeterminate) &&
                  'border-dynamic-yellow bg-dynamic-yellow/20',
              ],
              completedTaskColor === 'green' && [
                'border-dynamic-green/50',
                'hover:scale-105 hover:border-dynamic-green hover:bg-dynamic-green/10',
                'focus:border-dynamic-green focus:outline-none focus:ring-2 focus:ring-dynamic-green/30 focus:ring-offset-2',
                (isChecked || isIndeterminate) &&
                  'border-dynamic-green bg-dynamic-green/20',
              ],
              completedTaskColor === 'cyan' && [
                'border-dynamic-cyan/50',
                'hover:scale-105 hover:border-dynamic-cyan hover:bg-dynamic-cyan/10',
                'focus:border-dynamic-cyan focus:outline-none focus:ring-2 focus:ring-dynamic-cyan/30 focus:ring-offset-2',
                (isChecked || isIndeterminate) &&
                  'border-dynamic-cyan bg-dynamic-cyan/20',
              ],
              completedTaskColor === 'blue' && [
                'border-dynamic-blue/50',
                'hover:scale-105 hover:border-dynamic-blue hover:bg-dynamic-blue/10',
                'focus:border-dynamic-blue focus:outline-none focus:ring-2 focus:ring-dynamic-blue/30 focus:ring-offset-2',
                (isChecked || isIndeterminate) &&
                  'border-dynamic-blue bg-dynamic-blue/20',
              ],
              completedTaskColor === 'purple' && [
                'border-dynamic-purple/50',
                'hover:scale-105 hover:border-dynamic-purple hover:bg-dynamic-purple/10',
                'focus:border-dynamic-purple focus:outline-none focus:ring-2 focus:ring-dynamic-purple/30 focus:ring-offset-2',
                (isChecked || isIndeterminate) &&
                  'border-dynamic-purple bg-dynamic-purple/20',
              ],
              completedTaskColor === 'pink' && [
                'border-dynamic-pink/50',
                'hover:scale-105 hover:border-dynamic-pink hover:bg-dynamic-pink/10',
                'focus:border-dynamic-pink focus:outline-none focus:ring-2 focus:ring-dynamic-pink/30 focus:ring-offset-2',
                (isChecked || isIndeterminate) &&
                  'border-dynamic-pink bg-dynamic-pink/20',
              ]
            )}
          >
            {/* Checkmark icon */}
            {isChecked && (
              <svg
                className={cn(
                  'h-3.5 w-3.5',
                  completedTaskColor ? 'text-foreground' : 'text-dynamic-green'
                )}
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M4 8l2.5 2.5L12 5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
            {/* Indeterminate dash icon */}
            {isIndeterminate && (
              <svg
                className={cn(
                  'h-3.5 w-3.5',
                  completedTaskColor ? 'text-foreground' : 'text-dynamic-orange'
                )}
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M4 8h8"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </button>
        </div>
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
