import { InternalApiError } from '@tuturuuu/internal-api/client';
import type { TaskScheduleBatchResponse } from '@tuturuuu/internal-api/tasks-scheduling';

export function visibleTaskScheduleSnapshot(
  snapshot: TaskScheduleBatchResponse | undefined,
  error: unknown
) {
  const denied =
    error instanceof InternalApiError &&
    (error.status === 401 ||
      (error.status === 403 && error.code !== 'MFA_REQUIRED'));
  return denied ? undefined : snapshot;
}
