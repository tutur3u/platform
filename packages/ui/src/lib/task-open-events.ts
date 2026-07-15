'use client';

export interface RequestOpenTaskPayload {
  taskId: string;
  wsId?: string;
  handled?: boolean;
  requestId?: string;
}

export const REQUEST_OPEN_TASK_EVENT = 'tuturuuu:request-open-task';
export const TASK_OPEN_RESULT_EVENT = 'tuturuuu:task-open-result';

export interface TaskOpenResultPayload {
  requestId: string;
  opened: boolean;
}

export interface RequestOpenTaskDispatchResult {
  handled: boolean;
  requestId: string;
}

export function dispatchRequestOpenTask(
  payload: RequestOpenTaskPayload
): RequestOpenTaskDispatchResult {
  if (typeof window === 'undefined') {
    return { handled: false, requestId: '' };
  }

  const requestId =
    payload.requestId ||
    (typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`);

  const eventDetail: RequestOpenTaskPayload = {
    ...payload,
    requestId,
    handled: false,
  };

  window.dispatchEvent(
    new CustomEvent<RequestOpenTaskPayload>(REQUEST_OPEN_TASK_EVENT, {
      detail: eventDetail,
    })
  );

  return {
    handled: !!eventDetail.handled,
    requestId,
  };
}

export function dispatchTaskOpenResult(payload: TaskOpenResultPayload): void {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent<TaskOpenResultPayload>(TASK_OPEN_RESULT_EVENT, {
      detail: payload,
    })
  );
}

export function waitForTaskOpenResult(
  requestId: string,
  timeoutMs = 5000
): Promise<boolean> {
  if (typeof window === 'undefined' || !requestId) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const handleResult = (event: Event) => {
      const customEvent = event as CustomEvent<TaskOpenResultPayload>;
      if (customEvent.detail?.requestId !== requestId) {
        return;
      }

      window.clearTimeout(timeoutId);
      window.removeEventListener(TASK_OPEN_RESULT_EVENT, handleResult);
      resolve(!!customEvent.detail?.opened);
    };

    const timeoutId = window.setTimeout(() => {
      window.removeEventListener(TASK_OPEN_RESULT_EVENT, handleResult);
      resolve(false);
    }, timeoutMs);

    window.addEventListener(
      TASK_OPEN_RESULT_EVENT,
      handleResult as EventListener
    );
  });
}
