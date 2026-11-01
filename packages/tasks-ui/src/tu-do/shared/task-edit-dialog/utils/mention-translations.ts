type TaskMentionKey =
  | 'delete_task'
  | 'delete_task_confirmation'
  | 'cancel'
  | 'deleting'
  | 'set_custom_due_date'
  | 'custom_due_date_description'
  | 'remove_due_date'
  | 'create_new_label'
  | 'create_new_label_description'
  | 'label_name'
  | 'color'
  | 'preview'
  | 'creating'
  | 'create_label'
  | 'create_new_project'
  | 'create_new_project_description'
  | 'project_name'
  | 'create_project';

// Narrow keys so an app's strictly typed `common` translator is assignable.
type CommonTranslate = (
  key: TaskMentionKey,
  values?: Record<string, string>
) => string;

/** Strings the description editor's task mention menus need. */
export function getTaskMentionTranslations(t: CommonTranslate) {
  return {
    delete_task: t('delete_task'),
    delete_task_confirmation: (name: string) =>
      t('delete_task_confirmation', { name }),
    cancel: t('cancel'),
    deleting: t('deleting'),
    set_custom_due_date: t('set_custom_due_date'),
    custom_due_date_description: t('custom_due_date_description'),
    remove_due_date: t('remove_due_date'),
    create_new_label: t('create_new_label'),
    create_new_label_description: t('create_new_label_description'),
    label_name: t('label_name'),
    color: t('color'),
    preview: t('preview'),
    creating: t('creating'),
    create_label: t('create_label'),
    create_new_project: t('create_new_project'),
    create_new_project_description: t('create_new_project_description'),
    project_name: t('project_name'),
    create_project: t('create_project'),
  };
}
