import { InternalApiError } from '@tuturuuu/internal-api/client';
import { describe, expect, it } from 'vitest';
import { visibleTaskScheduleSnapshot } from './task-schedule-snapshot';

const snapshot = {
  minutesByTaskId: { task: 30 },
  settingsByTaskId: { task: null },
};
describe('task schedule revalidation visibility', () => {
  it.each([
    new Error('offline'),
    new InternalApiError('busy', 429),
    new InternalApiError('unavailable', 503),
    new InternalApiError('verify', 403, 'MFA_REQUIRED'),
  ])('retains authorized schedules through recoverable failures', (error) => {
    expect(visibleTaskScheduleSnapshot(snapshot, error)).toBe(snapshot);
  });
  it.each([401, 403])(
    'hides retained schedules when access is denied (%s)',
    (status) => {
      expect(
        visibleTaskScheduleSnapshot(
          snapshot,
          new InternalApiError('denied', status)
        )
      ).toBeUndefined();
    }
  );
});
