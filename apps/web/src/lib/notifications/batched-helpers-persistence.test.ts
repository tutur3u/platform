import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { describe, expect, it, vi } from 'vitest';
import {
  markBatchSent,
  markDeliveryLogsSentByIds,
  markDeliveryLogsSkipped,
} from './batched-helpers';
import { filterEmailDeliveryLogs } from './email-delivery-filter';

function client(error: Error | null) {
  const result = Promise.resolve({ error });
  const query = Object.assign(result, { eq: vi.fn(), in: vi.fn() });
  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  const update = vi.fn(() => query);
  const from = vi.fn(() => ({ update }));
  const schema = vi.fn(() => ({ from }));
  return {
    sb: { schema } as unknown as TypedSupabaseClient,
    from,
    update,
    query,
  };
}
describe('batched notification persistence', () => {
  it('propagates skip persistence errors before any eligible item can proceed', async () => {
    const failure = new Error('skip write');
    const { sb, update } = client(failure);
    const logs = [{ id: 'old' }, { id: 'fresh' }];
    await expect(
      filterEmailDeliveryLogs(
        logs,
        async (log) =>
          log.id === 'old' ? 'skipped: task_due_older_than_1_day' : null,
        async (items, reason) =>
          markDeliveryLogsSkipped(
            sb,
            items.map((item) => item.id),
            reason
          )
      )
    ).rejects.toBe(failure);
    expect(update).toHaveBeenCalledTimes(1);
  });
  it('throws a batch settlement write error', async () => {
    const failure = new Error('batch write');
    await expect(markBatchSent(client(failure).sb, 'batch-1', 2)).rejects.toBe(
      failure
    );
  });
  it('throws a delivery settlement write error', async () => {
    const failure = new Error('log write');
    await expect(
      markDeliveryLogsSentByIds(client(failure).sb, ['log-1'])
    ).rejects.toBe(failure);
  });
  it('checks errors in the batch-id fallback settlement path', async () => {
    const failure = new Error('fallback write');
    await expect(
      markDeliveryLogsSentByIds(client(failure).sb, [], 'batch-1')
    ).rejects.toBe(failure);
  });
  it('stops before later chunks after a failed skip write', async () => {
    const { sb, update } = client(new Error('skip write'));
    await expect(
      markDeliveryLogsSkipped(
        sb,
        Array.from({ length: 500 }, (_, i) => `log-${i}`),
        'skipped: task_unavailable'
      )
    ).rejects.toThrow();
    expect(update).toHaveBeenCalledTimes(1);
  });
  it('settles successfully while preserving pending-status guards and unique IDs', async () => {
    const { sb, query, update } = client(null);
    await markDeliveryLogsSkipped(
      sb,
      ['log-1', 'log-1'],
      'skipped: task_unavailable'
    );
    expect(query.in).toHaveBeenCalledWith('id', ['log-1']);
    expect(query.eq).toHaveBeenCalledWith('status', 'pending');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'sent',
        error_message: 'skipped: task_unavailable',
      })
    );
    await markBatchSent(sb, 'batch-1', 1);
    await markDeliveryLogsSentByIds(sb, ['log-1']);
    expect(query.eq).toHaveBeenCalledWith('id', 'batch-1');
  });
});

it('Cloudflare selects at most 25 pending batches and refuses a 21st notification page', async () => {
  const { fetchPendingBatchedNotificationBatches } = await import(
    './batched-helpers'
  );
  const { fetchAllPaginatedRows } = await import('./cron-helpers');
  const { withWebCronBudget } = await import('../cron/web-cron-budget');
  const range = vi.fn(async (_from: number, to: number) => ({
    data: Array.from({ length: to + 1 }, (_, index) => ({
      id: `batch-${index}`,
    })),
    error: null,
  }));
  const query = {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    lte() {
      return this;
    },
    or() {
      return this;
    },
    order() {
      return this;
    },
    range,
  };
  await withWebCronBudget(async () => {
    const rows = await fetchPendingBatchedNotificationBatches({
      schema: () => ({ from: () => query }),
    });
    expect(rows).toHaveLength(25);
    expect(range).toHaveBeenCalledExactlyOnceWith(0, 24);
  });
  await withWebCronBudget(async () => {
    const page = vi.fn(async () => ({
      data: Array(1000).fill('row'),
      error: null,
    }));
    await expect(fetchAllPaginatedRows(page)).rejects.toThrow('page budget');
    expect(page).toHaveBeenCalledTimes(20);
  });
});
