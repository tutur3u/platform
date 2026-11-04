'use client';

import { useTranslations } from 'next-intl';

/** Labels for the board's Recycle Bin view. */
export function useRecycleBinTranslations() {
  const t = useTranslations('common');
  const tBoards = useTranslations('ws-task-boards');
  return {
    recycleBin: t('recycle_bin'),
    recycleBinDescription: t('recycle_bin_description'),
    noDeletedTasks: t('no_deleted_tasks'),
    deletedTasksWillAppearHere: t('deleted_tasks_will_appear_here'),
    selectedOfTotal: t('selected_of_total', {
      selected: '{selected}',
      total: '{total}',
    }),
    deletedTasksCount: t('deleted_tasks_count', { count: '{count}' }),
    restore: t('restore'),
    delete: t('delete'),
    restoreTasksTitle: t('restore_tasks_title', { count: '{count}' }),
    restoreTasksDescription: t('restore_tasks_description'),
    cancel: t('cancel'),
    restoring: t('restoring'),
    permanentlyDeleteTitle: t('permanently_delete_title', {
      count: '{count}',
    }),
    permanentlyDeleteDescription: t('permanently_delete_description'),
    deleting: t('deleting'),
    deletePermanently: t('delete_permanently'),
    noListsAvailable: t('no_lists_available'),
    restoredTasks: t('restored_tasks', { count: '{count}' }),
    failedToRestore: t('failed_to_restore'),
    permanentlyDeleted: t('permanently_deleted', {
      count: '{count}',
    }),
    failedToDelete: t('failed_to_delete'),
    deletedAgo: t('deleted_ago', { time: '{time}' }),
    fromList: t('from_list', { list: '{list}' }),
    nProjects: t('n_projects', { count: '{count}' }),
    selectAllTasks: t('select_all_tasks'),
    selectTask: t('select_task', { name: '{name}' }),
    critical: tBoards('dialog.priority.critical'),
    high: tBoards('dialog.priority.high'),
    normal: tBoards('dialog.priority.normal'),
    low: tBoards('dialog.priority.low'),
    unknownList: t('unknown_list'),
  };
}
