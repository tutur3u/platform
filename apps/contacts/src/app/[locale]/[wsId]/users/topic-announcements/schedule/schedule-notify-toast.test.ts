import { beforeEach, describe, expect, it, vi } from 'vitest';

const toast = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
}));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast }));

const { toastScheduleNotification } = await import('./schedule-notify-toast');

const t = ((key: string, values?: { count?: number }) =>
  values?.count === undefined ? key : `${key}:${values.count}`) as never;

beforeEach(() => vi.clearAllMocks());

describe('toastScheduleNotification', () => {
  it('reports notified and skipped unlinked teachers', () => {
    toastScheduleNotification(t, {
      failed: false,
      result: {
        failedTeachers: 0,
        notifiedTeachers: 2,
        skippedUnlinkedTeachers: 1,
        unassignedAnnouncements: 0,
      },
    });
    expect(toast.success).toHaveBeenCalledWith('schedule_notify_sent:2');
    expect(toast.warning).toHaveBeenCalledWith('schedule_notify_skipped:1');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('reports a failed notification without hiding the save', () => {
    toastScheduleNotification(t, { failed: true, result: null });
    expect(toast.error).toHaveBeenCalledWith('schedule_notify_failed');
  });

  it('stays quiet when nothing was notified', () => {
    toastScheduleNotification(t, null);
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
  });
});
