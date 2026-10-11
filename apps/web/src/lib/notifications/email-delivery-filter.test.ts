import { describe, expect, it, vi } from 'vitest';
import { filterEmailDeliveryLogs } from './email-delivery-filter';
import { TASK_EMAIL_OVERDUE_SKIP_REASON } from './task-email-freshness';

describe('final per-item email filtering', () => {
  it.each([
    ['fresh', 'overdue'],
    ['overdue', 'fresh'],
  ])('excludes overdue item from mixed digest %s/%s', async (first, second) => {
    const logs = [first, second];
    const check = vi.fn(async (id: string) =>
      id === 'overdue' ? TASK_EMAIL_OVERDUE_SKIP_REASON : null
    );
    const mark = vi.fn(async () => {});
    expect(await filterEmailDeliveryLogs(logs, check, mark)).toEqual({
      deliverableLogs: ['fresh'],
      skippedCount: 1,
    });
    expect(check.mock.calls).toEqual([[first], [second]]);
    expect(mark).toHaveBeenCalledWith(
      ['overdue'],
      TASK_EMAIL_OVERDUE_SKIP_REASON
    );
  });
  it('returns no provider items when every item is overdue', async () => {
    const mark = vi.fn(async () => {});
    expect(
      await filterEmailDeliveryLogs(
        ['a', 'b'],
        async () => TASK_EMAIL_OVERDUE_SKIP_REASON,
        mark
      )
    ).toEqual({ deliverableLogs: [], skippedCount: 2 });
    expect(mark).toHaveBeenCalledWith(
      ['a', 'b'],
      TASK_EMAIL_OVERDUE_SKIP_REASON
    );
  });
  it('rechecks current state rather than caching initial eligibility', async () => {
    let currentReason: string | null = TASK_EMAIL_OVERDUE_SKIP_REASON;
    const check = async () => currentReason;
    const mark = vi.fn(async () => {});
    expect(
      (await filterEmailDeliveryLogs(['rescheduled'], check, mark)).skippedCount
    ).toBe(1);
    currentReason = null;
    expect(
      (await filterEmailDeliveryLogs(['rescheduled'], check, mark))
        .deliverableLogs
    ).toEqual(['rescheduled']);
  });
  it('unknown current lookup aborts before marking skips or returning provider items', async () => {
    const mark = vi.fn(async () => {});
    await expect(
      filterEmailDeliveryLogs(
        ['overdue', 'unknown'],
        async (id) => {
          if (id === 'unknown') throw new Error('lookup unavailable');
          return TASK_EMAIL_OVERDUE_SKIP_REASON;
        },
        mark
      )
    ).rejects.toThrow('lookup unavailable');
    expect(mark).not.toHaveBeenCalled();
  });
  it('propagates skip persistence failure before provider work', async () => {
    await expect(
      filterEmailDeliveryLogs(
        ['overdue'],
        async () => TASK_EMAIL_OVERDUE_SKIP_REASON,
        async () => {
          throw new Error('write unavailable');
        }
      )
    ).rejects.toThrow('write unavailable');
  });
});
