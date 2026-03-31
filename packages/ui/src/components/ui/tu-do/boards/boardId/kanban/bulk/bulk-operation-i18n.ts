type TranslationValues = Record<string, string | number>;

function formatFallback(template: string, values?: TranslationValues): string {
  if (!values) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = values[key];
    return value === undefined ? `{${key}}` : String(value);
  });
}

function getTaskWord(count: number) {
  return count === 1 ? 'task' : 'tasks';
}

export interface BulkOperationI18n {
  failedUpdatePriority: () => string;
  failedUpdateEstimation: () => string;
  failedUpdateDueDate: () => string;
  failedMoveToAnotherBoard: () => string;
  failedMoveSelectedTasks: () => string;
  failedAddLabel: () => string;
  failedRemoveLabel: () => string;
  failedAddProject: () => string;
  failedRemoveProject: () => string;
  failedAddAssignee: () => string;
  failedRemoveAssignee: () => string;
  failedClearLabels: () => string;
  failedClearProjects: () => string;
  failedClearAssignees: () => string;
  failedDeleteTasks: () => string;
  partialUpdateCompletedTitle: () => string;
  partialMoveCompletedTitle: () => string;
  partialDeletionCompletedTitle: () => string;
  priorityUpdatedTitle: () => string;
  estimationUpdatedTitle: () => string;
  dueDateUpdatedTitle: () => string;
  tasksMovedToBoardTitle: () => string;
  tasksMovedToListTitle: (listName: string) => string;
  tasksMovedToStatusTitle: (status: string) => string;
  labelAddedTitle: () => string;
  labelRemovedTitle: () => string;
  partialLabelAdditionCompletedTitle: () => string;
  partialLabelRemovalCompletedTitle: () => string;
  projectAddedTitle: () => string;
  projectRemovedTitle: () => string;
  partialProjectAdditionCompletedTitle: () => string;
  partialProjectRemovalCompletedTitle: () => string;
  assigneeAddedTitle: () => string;
  assigneeRemovedTitle: () => string;
  partialAssigneeAdditionCompletedTitle: () => string;
  partialAssigneeRemovalCompletedTitle: () => string;
  labelsClearedTitle: () => string;
  projectsClearedTitle: () => string;
  assigneesClearedTitle: () => string;
  partialLabelClearCompletedTitle: () => string;
  partialProjectClearCompletedTitle: () => string;
  partialAssigneeClearCompletedTitle: () => string;
  deletedSelectedTasksTitle: () => string;
  updatedDescription: (count: number) => string;
  updatedPartialDescription: (count: number, failed: number) => string;
  movedDescription: (count: number) => string;
  movedPartialDescription: (count: number, failed: number) => string;
  labelAddedDescription: (labelName: string, count: number) => string;
  labelAddedPartialDescription: (
    labelName: string,
    count: number,
    failed: number
  ) => string;
  labelRemovedDescription: (labelName: string, count: number) => string;
  labelRemovedPartialDescription: (
    labelName: string,
    count: number,
    failed: number
  ) => string;
  projectAddedDescription: (projectName: string, count: number) => string;
  projectAddedPartialDescription: (
    projectName: string,
    count: number,
    failed: number
  ) => string;
  projectRemovedDescription: (projectName: string, count: number) => string;
  projectRemovedPartialDescription: (
    projectName: string,
    count: number,
    failed: number
  ) => string;
  assigneeAddedDescription: (count: number) => string;
  assigneeAddedPartialDescription: (count: number, failed: number) => string;
  assigneeRemovedDescription: (count: number) => string;
  assigneeRemovedPartialDescription: (count: number, failed: number) => string;
  labelsClearedDescription: (count: number) => string;
  labelsClearedPartialDescription: (count: number, failed: number) => string;
  projectsClearedDescription: (count: number) => string;
  projectsClearedPartialDescription: (count: number, failed: number) => string;
  assigneesClearedDescription: (count: number) => string;
  assigneesClearedPartialDescription: (count: number, failed: number) => string;
  deletedPartialDescription: (count: number, failed: number) => string;
  defaultLabelName: () => string;
  defaultProjectName: () => string;
  loadingAssigneeName: () => string;
}

export function createBulkOperationI18n(
  t: (key: string, values?: TranslationValues) => string
): BulkOperationI18n {
  const translate = (
    key: string,
    fallback: string,
    values?: TranslationValues
  ) => {
    try {
      return t(`ws-task-boards.bulk.operations.${key}`, values);
    } catch {
      return formatFallback(fallback, values);
    }
  };

  return {
    failedUpdatePriority: () =>
      translate(
        'errors.failed_update_priority',
        'Failed to update priority for selected tasks'
      ),
    failedUpdateEstimation: () =>
      translate(
        'errors.failed_update_estimation',
        'Failed to update estimation for selected tasks'
      ),
    failedUpdateDueDate: () =>
      translate(
        'errors.failed_update_due_date',
        'Failed to update due date for selected tasks'
      ),
    failedMoveToAnotherBoard: () =>
      translate(
        'errors.failed_move_to_another_board',
        'Failed to move selected tasks to another board'
      ),
    failedMoveSelectedTasks: () =>
      translate('errors.failed_move_selected', 'Failed to move selected tasks'),
    failedAddLabel: () =>
      translate(
        'errors.failed_add_label',
        'Failed to add label to selected tasks'
      ),
    failedRemoveLabel: () =>
      translate(
        'errors.failed_remove_label',
        'Failed to remove label from selected tasks'
      ),
    failedAddProject: () =>
      translate(
        'errors.failed_add_project',
        'Failed to add project to selected tasks'
      ),
    failedRemoveProject: () =>
      translate(
        'errors.failed_remove_project',
        'Failed to remove project from selected tasks'
      ),
    failedAddAssignee: () =>
      translate(
        'errors.failed_add_assignee',
        'Failed to add assignee to selected tasks'
      ),
    failedRemoveAssignee: () =>
      translate(
        'errors.failed_remove_assignee',
        'Failed to remove assignee from selected tasks'
      ),
    failedClearLabels: () =>
      translate(
        'errors.failed_clear_labels',
        'Failed to clear labels from selected tasks'
      ),
    failedClearProjects: () =>
      translate(
        'errors.failed_clear_projects',
        'Failed to clear projects from selected tasks'
      ),
    failedClearAssignees: () =>
      translate(
        'errors.failed_clear_assignees',
        'Failed to clear assignees from selected tasks'
      ),
    failedDeleteTasks: () =>
      translate(
        'errors.failed_delete_tasks',
        'Failed to delete selected tasks'
      ),
    partialUpdateCompletedTitle: () =>
      translate('titles.partial_update_completed', 'Partial update completed'),
    partialMoveCompletedTitle: () =>
      translate('titles.partial_move_completed', 'Partial move completed'),
    partialDeletionCompletedTitle: () =>
      translate(
        'titles.partial_deletion_completed',
        'Partial deletion completed'
      ),
    priorityUpdatedTitle: () =>
      translate('titles.priority_updated', 'Priority updated'),
    estimationUpdatedTitle: () =>
      translate('titles.estimation_updated', 'Estimation updated'),
    dueDateUpdatedTitle: () =>
      translate('titles.due_date_updated', 'Due date updated'),
    tasksMovedToBoardTitle: () =>
      translate('titles.tasks_moved_to_board', 'Tasks moved to board'),
    tasksMovedToListTitle: (listName: string) =>
      translate('titles.tasks_moved_to_list', 'Tasks moved to {listName}', {
        listName,
      }),
    tasksMovedToStatusTitle: (status: string) =>
      translate('titles.tasks_moved_to_status', 'Tasks moved to {status}', {
        status,
      }),
    labelAddedTitle: () => translate('titles.label_added', 'Label added'),
    labelRemovedTitle: () => translate('titles.label_removed', 'Label removed'),
    partialLabelAdditionCompletedTitle: () =>
      translate(
        'titles.partial_label_addition_completed',
        'Partial label addition completed'
      ),
    partialLabelRemovalCompletedTitle: () =>
      translate(
        'titles.partial_label_removal_completed',
        'Partial label removal completed'
      ),
    projectAddedTitle: () => translate('titles.project_added', 'Project added'),
    projectRemovedTitle: () =>
      translate('titles.project_removed', 'Project removed'),
    partialProjectAdditionCompletedTitle: () =>
      translate(
        'titles.partial_project_addition_completed',
        'Partial project addition completed'
      ),
    partialProjectRemovalCompletedTitle: () =>
      translate(
        'titles.partial_project_removal_completed',
        'Partial project removal completed'
      ),
    assigneeAddedTitle: () =>
      translate('titles.assignee_added', 'Assignee added'),
    assigneeRemovedTitle: () =>
      translate('titles.assignee_removed', 'Assignee removed'),
    partialAssigneeAdditionCompletedTitle: () =>
      translate(
        'titles.partial_assignee_addition_completed',
        'Partial assignee addition completed'
      ),
    partialAssigneeRemovalCompletedTitle: () =>
      translate(
        'titles.partial_assignee_removal_completed',
        'Partial assignee removal completed'
      ),
    labelsClearedTitle: () =>
      translate('titles.labels_cleared', 'Labels cleared'),
    projectsClearedTitle: () =>
      translate('titles.projects_cleared', 'Projects cleared'),
    assigneesClearedTitle: () =>
      translate('titles.assignees_cleared', 'Assignees cleared'),
    partialLabelClearCompletedTitle: () =>
      translate(
        'titles.partial_label_clear_completed',
        'Partial label clear completed'
      ),
    partialProjectClearCompletedTitle: () =>
      translate(
        'titles.partial_project_clear_completed',
        'Partial project clear completed'
      ),
    partialAssigneeClearCompletedTitle: () =>
      translate(
        'titles.partial_assignee_clear_completed',
        'Partial assignee clear completed'
      ),
    deletedSelectedTasksTitle: () =>
      translate('titles.deleted_selected_tasks', 'Deleted selected tasks'),
    updatedDescription: (count: number) =>
      translate('descriptions.updated', '{count} {taskWord} updated', {
        count,
        taskWord: getTaskWord(count),
      }),
    updatedPartialDescription: (count: number, failed: number) =>
      translate(
        'descriptions.updated_partial',
        '{count} {taskWord} updated, {failed} failed to update',
        {
          count,
          failed,
          taskWord: getTaskWord(count),
        }
      ),
    movedDescription: (count: number) =>
      translate('descriptions.moved', '{count} {taskWord} moved successfully', {
        count,
        taskWord: getTaskWord(count),
      }),
    movedPartialDescription: (count: number, failed: number) =>
      translate(
        'descriptions.moved_partial',
        '{count} {taskWord} moved, {failed} failed to move',
        {
          count,
          failed,
          taskWord: getTaskWord(count),
        }
      ),
    labelAddedDescription: (labelName: string, count: number) =>
      translate(
        'descriptions.label_added',
        'Added "{labelName}" to {count} {taskWord}',
        {
          labelName,
          count,
          taskWord: getTaskWord(count),
        }
      ),
    labelAddedPartialDescription: (
      labelName: string,
      count: number,
      failed: number
    ) =>
      translate(
        'descriptions.label_added_partial',
        'Added "{labelName}" to {count} {taskWord}, {failed} failed',
        {
          labelName,
          count,
          failed,
          taskWord: getTaskWord(count),
        }
      ),
    labelRemovedDescription: (labelName: string, count: number) =>
      translate(
        'descriptions.label_removed',
        'Removed "{labelName}" from {count} {taskWord}',
        {
          labelName,
          count,
          taskWord: getTaskWord(count),
        }
      ),
    labelRemovedPartialDescription: (
      labelName: string,
      count: number,
      failed: number
    ) =>
      translate(
        'descriptions.label_removed_partial',
        'Removed "{labelName}" from {count} {taskWord}, {failed} failed',
        {
          labelName,
          count,
          failed,
          taskWord: getTaskWord(count),
        }
      ),
    projectAddedDescription: (projectName: string, count: number) =>
      translate(
        'descriptions.project_added',
        'Added "{projectName}" to {count} {taskWord}',
        {
          projectName,
          count,
          taskWord: getTaskWord(count),
        }
      ),
    projectAddedPartialDescription: (
      projectName: string,
      count: number,
      failed: number
    ) =>
      translate(
        'descriptions.project_added_partial',
        'Added "{projectName}" to {count} {taskWord}, {failed} failed',
        {
          projectName,
          count,
          failed,
          taskWord: getTaskWord(count),
        }
      ),
    projectRemovedDescription: (projectName: string, count: number) =>
      translate(
        'descriptions.project_removed',
        'Removed "{projectName}" from {count} {taskWord}',
        {
          projectName,
          count,
          taskWord: getTaskWord(count),
        }
      ),
    projectRemovedPartialDescription: (
      projectName: string,
      count: number,
      failed: number
    ) =>
      translate(
        'descriptions.project_removed_partial',
        'Removed "{projectName}" from {count} {taskWord}, {failed} failed',
        {
          projectName,
          count,
          failed,
          taskWord: getTaskWord(count),
        }
      ),
    assigneeAddedDescription: (count: number) =>
      translate(
        'descriptions.assignee_added',
        'Added assignee to {count} {taskWord}',
        {
          count,
          taskWord: getTaskWord(count),
        }
      ),
    assigneeAddedPartialDescription: (count: number, failed: number) =>
      translate(
        'descriptions.assignee_added_partial',
        'Added assignee to {count} {taskWord}, {failed} failed',
        {
          count,
          failed,
          taskWord: getTaskWord(count),
        }
      ),
    assigneeRemovedDescription: (count: number) =>
      translate(
        'descriptions.assignee_removed',
        'Removed assignee from {count} {taskWord}',
        {
          count,
          taskWord: getTaskWord(count),
        }
      ),
    assigneeRemovedPartialDescription: (count: number, failed: number) =>
      translate(
        'descriptions.assignee_removed_partial',
        'Removed assignee from {count} {taskWord}, {failed} failed',
        {
          count,
          failed,
          taskWord: getTaskWord(count),
        }
      ),
    labelsClearedDescription: (count: number) =>
      translate(
        'descriptions.labels_cleared',
        'Cleared all labels from {count} {taskWord}',
        {
          count,
          taskWord: getTaskWord(count),
        }
      ),
    labelsClearedPartialDescription: (count: number, failed: number) =>
      translate(
        'descriptions.labels_cleared_partial',
        'Cleared labels from {count} {taskWord}, {failed} failed',
        {
          count,
          failed,
          taskWord: getTaskWord(count),
        }
      ),
    projectsClearedDescription: (count: number) =>
      translate(
        'descriptions.projects_cleared',
        'Cleared all projects from {count} {taskWord}',
        {
          count,
          taskWord: getTaskWord(count),
        }
      ),
    projectsClearedPartialDescription: (count: number, failed: number) =>
      translate(
        'descriptions.projects_cleared_partial',
        'Cleared projects from {count} {taskWord}, {failed} failed',
        {
          count,
          failed,
          taskWord: getTaskWord(count),
        }
      ),
    assigneesClearedDescription: (count: number) =>
      translate(
        'descriptions.assignees_cleared',
        'Cleared all assignees from {count} {taskWord}',
        {
          count,
          taskWord: getTaskWord(count),
        }
      ),
    assigneesClearedPartialDescription: (count: number, failed: number) =>
      translate(
        'descriptions.assignees_cleared_partial',
        'Cleared assignees from {count} {taskWord}, {failed} failed',
        {
          count,
          failed,
          taskWord: getTaskWord(count),
        }
      ),
    deletedPartialDescription: (count: number, failed: number) =>
      translate(
        'descriptions.deleted_partial',
        '{count} {taskWord} deleted, {failed} failed to delete',
        {
          count,
          failed,
          taskWord: getTaskWord(count),
        }
      ),
    defaultLabelName: () => translate('defaults.label_name', 'Label'),
    defaultProjectName: () => translate('defaults.project_name', 'Project'),
    loadingAssigneeName: () =>
      translate('defaults.loading_assignee_name', 'Loading...'),
  };
}
