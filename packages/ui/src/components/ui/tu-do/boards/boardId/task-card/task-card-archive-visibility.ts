interface TaskCardQuickArchiveVisibilityOptions {
  hasTargetClosedList: boolean;
  isOverlay: boolean;
  taskListStatus?: string | null;
}

export function shouldRenderTaskCardQuickArchive({
  hasTargetClosedList,
  isOverlay,
  taskListStatus,
}: TaskCardQuickArchiveVisibilityOptions) {
  return (
    !isOverlay &&
    hasTargetClosedList &&
    (taskListStatus === 'done' || taskListStatus === 'documents')
  );
}
