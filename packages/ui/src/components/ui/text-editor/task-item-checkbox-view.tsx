'use client';

import type { NodeViewProps } from '@tiptap/react';
import { NodeViewContent } from '@tiptap/react';
import { cn } from '@tuturuuu/utils/format';
import { useCallback, useMemo, useState } from 'react';
import { DraggableNodeContainer } from './draggable-node-container';
import {
  areAllMentionedTasksCompleted,
  extractTaskMentionIds,
  getCompletedTaskColor,
  getNextTriState,
  resolveCheckboxState,
  type TriStateChecked,
  useMentionedTaskStatuses,
} from './task-item-checkbox';

export function TaskItemCheckboxContent({
  node,
  getPos,
  editor,
}: NodeViewProps) {
  const [manualOverride, setManualOverride] = useState<TriStateChecked | null>(
    null
  );

  const taskMentionIds = useMemo(() => {
    return extractTaskMentionIds(node);
  }, [node]);

  const { data: mentionedTasks } = useMentionedTaskStatuses(taskMentionIds);

  const allMentionedTasksCompleted = useMemo(() => {
    return areAllMentionedTasksCompleted(mentionedTasks);
  }, [mentionedTasks]);

  const completedTaskColor = useMemo(() => {
    return getCompletedTaskColor(mentionedTasks);
  }, [mentionedTasks]);

  const checkboxState = useMemo((): TriStateChecked => {
    return resolveCheckboxState({
      manualOverride,
      nodeChecked: node.attrs.checked,
      allMentionedTasksCompleted,
    });
  }, [manualOverride, node.attrs.checked, allMentionedTasksCompleted]);

  const isChecked = checkboxState === true;
  const isIndeterminate = checkboxState === 'indeterminate';

  const handleCheckboxCycle = useCallback(() => {
    if (!editor.isEditable) return;

    const pos = getPos();
    if (typeof pos !== 'number') return;

    const nextState = getNextTriState(checkboxState);

    setManualOverride(nextState);

    editor.commands.command(({ tr }) => {
      tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        checked: nextState,
      });
      return true;
    });
  }, [editor, getPos, node.attrs, checkboxState]);

  const handleCheckboxMouseDown = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (!editor.isEditable) return;
      handleCheckboxCycle();
    },
    [editor, handleCheckboxCycle]
  );

  return (
    <div className="flex items-start gap-2">
      <div
        className="task-list-checkbox-label flex shrink-0 select-none pt-2.5"
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
          aria-disabled={!editor.isEditable}
          onMouseDown={handleCheckboxMouseDown}
          className={cn(
            'task-list-checkbox flex h-4.5 w-4.5 items-center justify-center',
            'cursor-pointer rounded-lg border-2 bg-background',
            'transition-all duration-150',
            !completedTaskColor && [
              'border-input',
              'hover:scale-105 hover:border-dynamic-gray hover:bg-dynamic-gray/10',
              'focus:border-dynamic-gray focus:outline-none focus:ring-2 focus:ring-dynamic-gray/30 focus:ring-offset-2',
              isChecked &&
                'border-dynamic-green bg-dynamic-green/20 hover:border-dynamic-green hover:bg-dynamic-green/10 focus:border-dynamic-green focus:ring-dynamic-green/30',
              isIndeterminate &&
                'border-dynamic-orange bg-dynamic-orange/20 hover:border-dynamic-orange hover:bg-dynamic-orange/10 focus:border-dynamic-orange focus:ring-dynamic-orange/30',
            ],
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

      <NodeViewContent
        className={cn(
          'transition-opacity duration-150',
          isChecked && 'task-content-faded'
        )}
      />
    </div>
  );
}

export function TaskItemCheckboxView(props: NodeViewProps) {
  return (
    <DraggableNodeContainer {...props} as="li" className="flex items-center">
      <TaskItemCheckboxContent {...props} />
    </DraggableNodeContainer>
  );
}
