export function shouldRenderTaskCardCompletionCheckbox({
  isMultiSelectMode,
  taskListStatus,
}: {
  isMultiSelectMode: boolean;
  taskListStatus?: string | null;
}) {
  return taskListStatus !== 'documents' && !isMultiSelectMode;
}
