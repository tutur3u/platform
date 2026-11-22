import { act, renderHook, waitFor } from '@testing-library/react';
import { InternalApiError } from '@tuturuuu/internal-api';
import { describe, expect, it, vi } from 'vitest';
import { DriveUploadAbortedError } from './drive-upload-transfer';
import { useDriveUploads } from './use-drive-uploads';

type TransferArgs = Parameters<
  NonNullable<Parameters<typeof useDriveUploads>[0]['transfer']>
>[0];

function deferredTransfer() {
  const calls: {
    args: TransferArgs;
    resolve: () => void;
    reject: (error: unknown) => void;
  }[] = [];
  const transfer = vi.fn(
    (args: TransferArgs) =>
      new Promise<void>((resolve, reject) => {
        args.signal.addEventListener('abort', () =>
          reject(new DriveUploadAbortedError())
        );
        calls.push({ args, resolve, reject });
      })
  );
  return { calls, transfer };
}

const file = (name: string, size = 10) =>
  new File([new Uint8Array(size)], name, { type: 'image/png' });

describe('useDriveUploads', () => {
  it('runs at most three transfers and refreshes once when the queue drains', async () => {
    const { calls, transfer } = deferredTransfer();
    const onSettled = vi.fn();
    const { result } = renderHook(() =>
      useDriveUploads({ onSettled, transfer, wsId: 'ws' })
    );

    act(() => {
      result.current.enqueue(
        ['a', 'b', 'c', 'd'].map((name) => file(`${name}.png`)),
        'marketing'
      );
    });
    expect(transfer).toHaveBeenCalledTimes(3);
    expect(calls[0]?.args.path).toBe('marketing');

    await act(async () => {
      calls[0]?.args.onProgress(5);
      calls[0]?.resolve();
    });
    expect(transfer).toHaveBeenCalledTimes(4);
    expect(onSettled).not.toHaveBeenCalled();

    await act(async () => {
      for (const call of calls.slice(1)) call.resolve();
    });
    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1));
    expect(result.current.summary.doneCount).toBe(4);
  });

  it('cancels a running upload and records a quota failure with its reason', async () => {
    const { calls, transfer } = deferredTransfer();
    const { result } = renderHook(() =>
      useDriveUploads({ onSettled: vi.fn(), transfer, wsId: 'ws' })
    );

    act(() => result.current.enqueue([file('a.png'), file('b.png')], ''));
    const [first, second] = result.current.items;

    await act(async () => {
      if (first) result.current.cancel(first.id);
      calls[1]?.reject(
        new InternalApiError('Workspace storage limit exceeded.', 413)
      );
    });

    await waitFor(() =>
      expect(result.current.items.map((item) => item.status)).toEqual([
        { kind: 'canceled' },
        { kind: 'failed', reason: 'quota' },
      ])
    );

    act(() => {
      if (second) result.current.retry(second.id);
    });
    expect(transfer).toHaveBeenCalledTimes(3);
  });
});
