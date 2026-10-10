import { describe, expect, it, vi } from 'vitest';
import { requestPeriodicReportDeliveryBatch } from './reports';

const workspace = '42529372-195e-4e23-928b-3c2a0954fa29';
const ids = [1, 2, 3].map(
  (id) => `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`
);
const queued = () =>
  new Response(
    JSON.stringify({ queued: true, status: 'queued', message: 'Queued' })
  );
const active = () => undefined;
const options = (request: typeof fetch) => ({
  baseUrl: 'https://example.test',
  fetch: request,
});

describe('reviewed report delivery batches through the existing endpoint', () => {
  it.each([
    ['invalid workspace', 'invalid', ids],
    ['empty selection', workspace, []],
    ['invalid report', workspace, ['invalid']],
    [
      'over the review limit',
      workspace,
      Array.from({ length: 101 }, () => ids[0]!),
    ],
  ])('rejects %s before transport', async (_label, ws, reports) => {
    const request = vi.fn<typeof fetch>();
    await expect(
      requestPeriodicReportDeliveryBatch(
        ws,
        reports,
        { assertActive: active },
        options(request)
      )
    ).rejects.toThrow('Invalid report delivery batch');
    expect(request).not.toHaveBeenCalled();
  });

  it('queues 100 reviewed recipients sequentially without claiming they were sent', async () => {
    const reports = Array.from(
      { length: 100 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
    );
    let inFlight = 0;
    let maximumInFlight = 0;
    const request = vi.fn<typeof fetch>().mockImplementation(async () => {
      inFlight++;
      maximumInFlight = Math.max(maximumInFlight, inFlight);
      await Promise.resolve();
      inFlight--;
      return queued();
    });
    const result = await requestPeriodicReportDeliveryBatch(
      workspace,
      reports,
      { assertActive: active },
      options(request)
    );
    expect(request).toHaveBeenCalledTimes(100);
    expect(maximumInFlight).toBe(1);
    expect(result.stopReason).toBe('complete');
    expect(result.items).toHaveLength(100);
    expect(result.items.every((item) => item.status === 'queued')).toBe(true);
    expect(result.remainingReportIds).toEqual([]);
  });

  it('deduplicates reports and uses only the existing send operation without caching', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => queued());
    const result = await requestPeriodicReportDeliveryBatch(
      workspace,
      [ids[0]!, ids[0]!, ids[1]!],
      { assertActive: active },
      options(request)
    );
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls.map(([url]) => String(url))).toEqual(
      ids
        .slice(0, 2)
        .map(
          (id) =>
            `https://example.test/api/v1/workspaces/${workspace}/users/reports/${id}/delivery`
        )
    );
    for (const [, init] of request.mock.calls) {
      expect(init).toMatchObject({
        method: 'POST',
        body: JSON.stringify({ action: 'send' }),
        cache: 'no-store',
      });
    }
    expect(result).toMatchObject({
      stopReason: 'complete',
      stopped: false,
      remainingReportIds: [],
      items: [
        { queued: true, status: 'queued' },
        { queued: true, status: 'queued' },
      ],
    });
  });

  it('waits for the first mutation before starting the next', async () => {
    let resolveFirst!: (value: Response) => void;
    const first = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const request = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(() => first)
      .mockImplementation(async () => queued());
    const promise = requestPeriodicReportDeliveryBatch(
      workspace,
      ids.slice(0, 2),
      { assertActive: active },
      options(request)
    );
    expect(request).toHaveBeenCalledTimes(1);
    resolveFirst(queued());
    await promise;
    expect(request).toHaveBeenCalledTimes(2);
  });

  it.each([409, 500])(
    'stops on HTTP %s without retrying or claiming an unsuccessful queue outcome',
    async (status) => {
      const request = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Reconcile before retry' }), {
          status,
        })
      );
      const result = await requestPeriodicReportDeliveryBatch(
        workspace,
        ids,
        { assertActive: active },
        options(request)
      );
      expect(request).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        stopReason: 'uncertain',
        stopped: true,
        remainingReportIds: ids.slice(1),
        items: [{ reportId: ids[0], queued: false, outcome: 'uncertain' }],
      });
    }
  );

  it('preserves prior confirmed queue results when the next request loses transport', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(queued())
      .mockRejectedValueOnce(new Error('Transport lost'));
    const result = await requestPeriodicReportDeliveryBatch(
      workspace,
      ids,
      { assertActive: active },
      options(request)
    );
    expect(request).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      stopReason: 'uncertain',
      remainingReportIds: [ids[2]],
      items: [{ outcome: 'queued' }, { outcome: 'uncertain' }],
    });
  });

  it('stops after a confirmed blocked response rather than skipping ahead', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          queued: false,
          status: 'blocked',
          message: 'Recipient suppressed',
        })
      )
    );
    const result = await requestPeriodicReportDeliveryBatch(
      workspace,
      ids,
      { assertActive: active },
      options(request)
    );
    expect(request).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      stopReason: 'rejected',
      items: [{ outcome: 'not-queued', error: 'Recipient suppressed' }],
    });
  });

  it.each([
    { queued: true, status: 'sent' },
    { queued: false, status: 'queued' },
    {},
  ])(
    'does not turn an inconsistent response into delivery success: %j',
    async (response) => {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(JSON.stringify(response)));
      const result = await requestPeriodicReportDeliveryBatch(
        workspace,
        ids,
        { assertActive: active },
        options(request)
      );
      expect(result.stopReason).toBe('uncertain');
      expect(result.items[0]?.outcome).toBe('uncertain');
      expect(request).toHaveBeenCalledTimes(1);
    }
  );

  it('makes no request when the actor lease is already invalid', async () => {
    const request = vi.fn<typeof fetch>();
    const result = await requestPeriodicReportDeliveryBatch(
      workspace,
      ids,
      {
        assertActive: () => {
          throw new Error('Actor changed');
        },
      },
      options(request)
    );
    expect(result).toMatchObject({
      stopReason: 'cancelled',
      items: [],
      remainingReportIds: ids,
    });
    expect(request).not.toHaveBeenCalled();
  });

  it('rechecks the lease after a progress callback before starting transport', async () => {
    let valid = true;
    const request = vi.fn<typeof fetch>();
    const result = await requestPeriodicReportDeliveryBatch(
      workspace,
      ids,
      {
        assertActive: () => {
          if (!valid) throw new Error('Actor changed');
        },
        onProgress: () => {
          valid = false;
        },
      },
      options(request)
    );
    expect(result.stopReason).toBe('cancelled');
    expect(request).not.toHaveBeenCalled();
  });

  it('awaits an admitted mutation but publishes no private results after actor loss', async () => {
    let valid = true;
    const progress = vi.fn();
    const request = vi.fn<typeof fetch>().mockImplementation(async () => {
      valid = false;
      return queued();
    });
    const result = await requestPeriodicReportDeliveryBatch(
      workspace,
      ids,
      {
        assertActive: () => {
          if (!valid) throw new Error('Actor changed');
        },
        onProgress: progress,
      },
      options(request)
    );
    expect(request).toHaveBeenCalledTimes(1);
    expect(progress).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      stopReason: 'cancelled',
      items: [{ outcome: 'queued' }],
      remainingReportIds: ids.slice(1),
    });
  });

  it('isolates progress snapshots from the retained results', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => queued());
    const result = await requestPeriodicReportDeliveryBatch(
      workspace,
      ids,
      {
        assertActive: active,
        onProgress: (progress) => {
          if (progress.items[0]) progress.items[0].queued = false;
          progress.items.length = 0;
        },
      },
      options(request)
    );
    expect(result.items).toHaveLength(3);
    expect(result.items.every((item) => item.queued)).toBe(true);
  });
});
