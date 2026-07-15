import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { type MouseEvent, useEffect, useRef } from 'react';
import { TaskCard, type TaskCardAssigneeMemberSource } from './task-card';

interface MeasuredTaskCardProps {
  task: Task;
  taskList: TaskList;
  boardId: string;
  workspaceId?: string;
  availableLists?: TaskList[];
  onUpdate: () => void;
  isSelected: boolean;
  isMultiSelectMode?: boolean;
  isPersonalWorkspace?: boolean;
  canUseBoardAssignees?: boolean;
  assigneeMemberSource?: TaskCardAssigneeMemberSource;
  onSelect?: (taskId: string, event: MouseEvent) => void;
  onClearSelection?: () => void;
  suppressSortableTransform?: boolean;
  hiddenFromLayout?: boolean;
  onHeight: (height: number) => void;
  optimisticUpdateInProgress?: Set<string>;
  selectedTasks?: Set<string>;
  bulkUpdateCustomDueDate?: (date: Date | null) => Promise<void>;
  readOnly?: boolean;
}

export function MeasuredTaskCard({
  task,
  taskList,
  boardId,
  workspaceId,
  availableLists,
  onUpdate,
  isSelected,
  isMultiSelectMode,
  isPersonalWorkspace,
  canUseBoardAssignees,
  assigneeMemberSource,
  onSelect,
  onClearSelection,
  suppressSortableTransform,
  hiddenFromLayout,
  onHeight,
  optimisticUpdateInProgress,
  selectedTasks,
  bulkUpdateCustomDueDate,
  readOnly = false,
}: MeasuredTaskCardProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const onHeightRef = useRef(onHeight);
  const hiddenFromLayoutRef = useRef(Boolean(hiddenFromLayout));

  useEffect(() => {
    onHeightRef.current = onHeight;
  }, [onHeight]);

  useEffect(() => {
    hiddenFromLayoutRef.current = Boolean(hiddenFromLayout);
  }, [hiddenFromLayout]);

  useEffect(() => {
    if (!ref.current) return;
    const node = ref.current;
    const card = node.firstElementChild as HTMLElement;
    if (!card) return;

    const publishHeight = (height: number) => {
      if (hiddenFromLayoutRef.current || height <= 0) return;
      onHeightRef.current(height);
    };

    publishHeight(card.getBoundingClientRect().height);

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === card) {
          publishHeight(entry.contentRect.height);
        }
      }
    });

    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-id={task.id}
      data-task-card-id={task.id}
      data-task-list-id={taskList.id}
      hidden={hiddenFromLayout}
    >
      <TaskCard
        task={task}
        taskList={taskList}
        boardId={boardId}
        workspaceId={workspaceId}
        availableLists={availableLists}
        onUpdate={onUpdate}
        isSelected={isSelected}
        isMultiSelectMode={isMultiSelectMode}
        isPersonalWorkspace={isPersonalWorkspace}
        canUseBoardAssignees={canUseBoardAssignees}
        assigneeMemberSource={assigneeMemberSource}
        onSelect={onSelect}
        onClearSelection={onClearSelection}
        suppressSortableTransform={suppressSortableTransform}
        optimisticUpdateInProgress={optimisticUpdateInProgress}
        selectedTasks={selectedTasks}
        bulkUpdateCustomDueDate={bulkUpdateCustomDueDate}
        readOnly={readOnly}
      />
    </div>
  );
}
