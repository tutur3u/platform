'use client';

export interface RequestOpenTaskPayload {
  taskId: string;
}

export const REQUEST_OPEN_TASK_EVENT = 'tuturuuu:request-open-task';

export function dispatchRequestOpenTask(payload: RequestOpenTaskPayload): void {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent<RequestOpenTaskPayload>(REQUEST_OPEN_TASK_EVENT, {
      detail: payload,
    })
  );
}
