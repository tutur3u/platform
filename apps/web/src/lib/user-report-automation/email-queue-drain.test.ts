import { describe, expect, it, vi } from 'vitest';
import {
  drainEmailQueue,
  EMAIL_CLAIM_SIZE,
  EMAIL_DRAIN_MAX_BATCHES,
  processWithConcurrency,
} from './email-queue-drain';

const full = () => Array.from({ length: EMAIL_CLAIM_SIZE }, (_, i) => i);

describe('bounded report email queue drain', () => {
  it('drains multiple claims serially and reports handled rows, not delivery outcomes', async () => {
    const claim = vi
      .fn()
      .mockResolvedValueOnce(full())
      .mockResolvedValueOnce(full())
      .mockResolvedValueOnce([0, 1]);
    const processBatch = vi.fn().mockResolvedValue(undefined);
    const result = await drainEmailQueue({ claim, processBatch, now: () => 0 });
    expect(result).toEqual({
      processedEmails: 42,
      emailBatches: 3,
      emailDrainStopReason: 'queue_empty',
    });
    expect(claim).toHaveBeenCalledTimes(3);
    expect(processBatch).toHaveBeenCalledTimes(3);
  });

  it('handles exactly 100 rows in five batches of 20 without a sixth claim', async () => {
    const claim = vi.fn().mockResolvedValue(full());
    const handled: number[] = [];
    const processBatch = vi.fn(async (rows: number[]) => {
      handled.push(...rows);
    });
    const result = await drainEmailQueue({
      claim,
      processBatch,
      now: () => 0,
    });
    expect(EMAIL_CLAIM_SIZE).toBe(20);
    expect(EMAIL_DRAIN_MAX_BATCHES).toBe(5);
    expect(claim).toHaveBeenCalledTimes(5);
    expect(processBatch).toHaveBeenCalledTimes(5);
    expect(processBatch.mock.calls.every(([rows]) => rows.length === 20)).toBe(
      true
    );
    expect(handled).toHaveLength(100);
    expect(result).toEqual({
      processedEmails: 100,
      emailBatches: 5,
      emailDrainStopReason: 'batch_limit',
    });
  });

  it('does not claim when the admission budget is already exhausted', async () => {
    const clock = vi.fn().mockReturnValueOnce(0).mockReturnValue(30_000);
    const claim = vi.fn();
    expect(
      await drainEmailQueue({ claim, processBatch: vi.fn(), now: clock })
    ).toEqual({
      processedEmails: 0,
      emailBatches: 0,
      emailDrainStopReason: 'time_budget',
    });
    expect(claim).not.toHaveBeenCalled();
  });

  it('awaits an admitted provider batch after the budget, without another claim', async () => {
    let time = 0;
    let finish: (() => void) | undefined;
    const claim = vi.fn().mockResolvedValue(full());
    const processBatch = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          time = 31_000;
          finish = resolve;
        })
    );
    let settled = false;
    const pending = drainEmailQueue({
      claim,
      processBatch,
      now: () => time,
    }).then((result) => {
      settled = true;
      return result;
    });
    await vi.waitFor(() => expect(processBatch).toHaveBeenCalledTimes(1));
    expect(settled).toBe(false);
    expect(claim).toHaveBeenCalledTimes(1);
    finish?.();
    expect(await pending).toEqual({
      processedEmails: 20,
      emailBatches: 1,
      emailDrainStopReason: 'time_budget',
    });
  });

  it('settles a claim that itself crosses the admission budget', async () => {
    let time = 0;
    const processBatch = vi.fn().mockResolvedValue(undefined);
    const claim = vi.fn(async () => {
      time = 31_000;
      return full();
    });
    const result = await drainEmailQueue({
      claim,
      processBatch,
      now: () => time,
    });
    expect(processBatch).toHaveBeenCalledOnce();
    expect(claim).toHaveBeenCalledOnce();
    expect(result.processedEmails).toBe(20);
    expect(result.emailDrainStopReason).toBe('time_budget');
  });

  it('stops on an empty queue without invoking a batch handler', async () => {
    const processBatch = vi.fn();
    expect(
      await drainEmailQueue({ claim: async () => [], processBatch })
    ).toEqual({
      processedEmails: 0,
      emailBatches: 0,
      emailDrainStopReason: 'queue_empty',
    });
    expect(processBatch).not.toHaveBeenCalled();
  });

  it('propagates a claim failure without another claim or provider attempt', async () => {
    const error = new Error('Database unavailable');
    const claim = vi
      .fn()
      .mockResolvedValueOnce(full())
      .mockRejectedValue(error);
    const processBatch = vi.fn().mockResolvedValue(undefined);
    await expect(
      drainEmailQueue({ claim, processBatch, now: () => 0 })
    ).rejects.toMatchObject({
      name: 'EmailQueueDrainError',
      originalError: error,
      processedEmails: 20,
      emailBatches: 1,
      stage: 'claim',
    });
    expect(claim).toHaveBeenCalledTimes(2);
    expect(processBatch).toHaveBeenCalledOnce();
  });

  it('awaits another in-flight provider after a completion RPC failure', async () => {
    const completionFailure = new Error('Failure completion RPC rejected');
    let releaseProvider: (() => void) | undefined;
    let providerFinished = false;
    let outcomeSettled = false;
    const claim = vi.fn().mockResolvedValue([{ id: 0 }, { id: 1 }]);
    const pending = drainEmailQueue<{ id: number }>({
      claim,
      processBatch: (rows) =>
        processWithConcurrency(rows, 4, async (row) => {
          if (row.id === 0) throw completionFailure;
          await new Promise<void>((resolve) => {
            releaseProvider = resolve;
          });
          providerFinished = true;
        }),
    }).catch((error: unknown) => {
      outcomeSettled = true;
      return error;
    });
    await vi.waitFor(() => expect(releaseProvider).toBeTypeOf('function'));
    expect(outcomeSettled).toBe(false);
    expect(providerFinished).toBe(false);
    expect(claim).toHaveBeenCalledOnce();
    releaseProvider?.();
    expect(await pending).toMatchObject({
      originalError: completionFailure,
      stage: 'process',
      processedEmails: 0,
      emailBatches: 0,
    });
    expect(providerFinished).toBe(true);
    expect(claim).toHaveBeenCalledOnce();
  });

  it('propagates batch failures and does not claim another lease', async () => {
    const claim = vi.fn().mockResolvedValue(full());
    await expect(
      drainEmailQueue({
        claim,
        now: () => 0,
        processBatch: async () => {
          throw new Error('Failed completion');
        },
      })
    ).rejects.toThrow('Failed completion');
    expect(claim).toHaveBeenCalledOnce();
  });

  it.each([0, -1, 1.5])(
    'rejects invalid maxBatches %s before claiming',
    async (maxBatches) => {
      const claim = vi.fn();
      await expect(
        drainEmailQueue({ claim, processBatch: vi.fn(), maxBatches })
      ).rejects.toThrow('Invalid email queue drain budget');
      expect(claim).not.toHaveBeenCalled();
    }
  );
});
