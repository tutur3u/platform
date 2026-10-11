import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { describe, expect, it, vi } from 'vitest';
import {
  beginBatchDeliveryAttempt,
  fetchNotificationBatchReconciliation,
  hasTerminalDeliveryLogSnapshot,
  markBatchReconciliationRequired,
} from './batch-reconciliation';
import { getPrivateNotificationClient } from './batched-helpers';

vi.mock('./batched-helpers', () => ({ getPrivateNotificationClient: vi.fn() }));
const sent = {
  id: 'log-1',
  batch_id: 'batch-1',
  status: 'sent',
  sent_at: '2026-10-11T00:00:00Z',
  error_message: null,
};

describe('notification batch reconciliation snapshot', () => {
  it('accepts only persisted sent or explicitly skipped terminal logs', () => {
    expect(hasTerminalDeliveryLogSnapshot('batch-1', [sent])).toBe(true);
    expect(
      hasTerminalDeliveryLogSnapshot('batch-1', [
        { ...sent, error_message: 'skipped: task_unavailable' },
      ])
    ).toBe(true);
  });
  it('keeps empty, duplicate, oversized or wrong-batch snapshots held', () => {
    expect(hasTerminalDeliveryLogSnapshot('batch-1', [])).toBe(false);
    expect(hasTerminalDeliveryLogSnapshot('batch-1', [sent, sent])).toBe(false);
    expect(hasTerminalDeliveryLogSnapshot('other', [sent])).toBe(false);
    expect(
      hasTerminalDeliveryLogSnapshot(
        'batch-1',
        Array.from({ length: 1001 }, (_, i) => ({ ...sent, id: String(i) }))
      )
    ).toBe(false);
  });
  it.each([
    { ...sent, status: 'pending' },
    { ...sent, status: 'failed' },
    { ...sent, sent_at: null },
    { ...sent, sent_at: 'invalid' },
    { ...sent, error_message: 'delivery_in_flight' },
    { ...sent, error_message: 'unknown provider outcome' },
  ])('does not treat unresolved log %j as known terminal settlement', (log) => {
    expect(hasTerminalDeliveryLogSnapshot('batch-1', [log])).toBe(false);
  });
});

function markerClient(result: {
  data: { id: string } | null;
  error: Error | null;
}) {
  const query = {
    update: vi.fn(),
    eq: vi.fn(),
    select: vi.fn(),
    maybeSingle: vi.fn(async () => result),
  };
  query.update.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.select.mockReturnValue(query);
  vi.mocked(getPrivateNotificationClient).mockReturnValue({
    from: vi.fn(() => query),
  });
  return query;
}
describe('durable processing reconciliation marker', () => {
  it('requires an exact processing row before a provider attempt can proceed', async () => {
    const query = markerClient({ data: { id: 'batch-1' }, error: null });
    await beginBatchDeliveryAttempt({}, 'batch-1');
    expect(query.eq).toHaveBeenCalledWith('status', 'processing');
    expect(query.update).toHaveBeenCalledWith({
      error_message: 'delivery_in_flight',
      updated_at: expect.any(String),
    });
    markerClient({ data: null, error: null });
    await expect(beginBatchDeliveryAttempt({}, 'batch-1')).rejects.toThrow(
      'not persisted'
    );
    markerClient({ data: { id: 'other' }, error: null });
    await expect(beginBatchDeliveryAttempt({}, 'batch-1')).rejects.toThrow(
      'not persisted'
    );
  });
  it('updates only the exact processing batch without changing its status', async () => {
    const query = markerClient({ data: { id: 'batch-1' }, error: null });
    await markBatchReconciliationRequired({}, 'batch-1');
    expect(query.eq).toHaveBeenCalledWith('id', 'batch-1');
    expect(query.eq).toHaveBeenCalledWith('status', 'processing');
    expect(query.update).toHaveBeenCalledWith({
      error_message: 'reconciliation_required',
      updated_at: expect.any(String),
    });
  });
  it('throws database errors instead of pretending the marker is durable', async () => {
    const error = new Error('write');
    markerClient({ data: null, error });
    await expect(markBatchReconciliationRequired({}, 'batch-1')).rejects.toBe(
      error
    );
  });
  it('throws when no guarded row was updated', async () => {
    markerClient({ data: null, error: null });
    await expect(
      markBatchReconciliationRequired({}, 'batch-1')
    ).rejects.toThrow('not persisted');
  });
});

describe('read-only processing reconciliation selector', () => {
  it('does not start a query when its bounded discovery deadline expired', async () => {
    const privateClient = vi.mocked(getPrivateNotificationClient);
    privateClient.mockClear();
    await expect(
      fetchNotificationBatchReconciliation({}, Date.now())
    ).resolves.toEqual([]);
    expect(privateClient).not.toHaveBeenCalled();
  });
  it('inspects marked root batches without exposing a resend or settlement write', async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      in: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      range: vi.fn(),
      update: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.in.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.limit.mockResolvedValue({
      data: [
        {
          id: 'batch-1',
          ws_id: ROOT_WORKSPACE_ID,
          error_message: 'reconciliation_required',
        },
      ],
      error: null,
    });
    query.range.mockResolvedValue({ data: [sent], error: null });
    vi.mocked(getPrivateNotificationClient).mockReturnValue({
      from: vi.fn(() => query),
    });
    await expect(
      fetchNotificationBatchReconciliation({}, Date.now() + 1000)
    ).resolves.toEqual([
      { batch_id: 'batch-1', terminal_log_snapshot: true, log_count: 1 },
    ]);
    expect(query.eq).toHaveBeenCalledWith('status', 'processing');
    expect(query.eq).toHaveBeenCalledWith('ws_id', ROOT_WORKSPACE_ID);
    expect(query.in).toHaveBeenCalledWith('error_message', [
      'delivery_in_flight',
      'reconciliation_required',
    ]);
    expect(query.update).not.toHaveBeenCalled();
  });
  it('rejects a failed processing inventory instead of returning a false empty result', async () => {
    const error = new Error('inventory');
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      in: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(async () => ({ data: null, error })),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.in.mockReturnValue(query);
    query.order.mockReturnValue(query);
    vi.mocked(getPrivateNotificationClient).mockReturnValue({
      from: vi.fn(() => query),
    });
    await expect(
      fetchNotificationBatchReconciliation({}, Date.now() + 1000)
    ).rejects.toBe(error);
  });
});
