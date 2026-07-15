export interface TaskCardVisibilityStateInput {
  isDragging: boolean;
  optimisticUpdateInProgress: boolean;
}

export function getTaskCardVisibilityState({
  isDragging,
  optimisticUpdateInProgress,
}: TaskCardVisibilityStateInput) {
  return {
    hidden: isDragging && !optimisticUpdateInProgress,
    pending: optimisticUpdateInProgress,
  };
}
