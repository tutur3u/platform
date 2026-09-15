import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import {
  reconcileMailWhenIdle,
  waitForMailBackgroundReads,
} from './mail-action-coordination';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('background read coordination', () => {
  it('waits for folder reads before persisting an explicit action', async () => {
    const client = new QueryClient();
    const read = deferred();
    const mutation = client.getMutationCache().build(client, {
      mutationKey: ['mail', 'ws', 'box', 'actions', 'folder-read'],
      mutationFn: () => read.promise,
    });
    const saving = mutation.execute(undefined);
    const persist = vi.fn();
    const action = waitForMailBackgroundReads(client, 'ws', 'box', ['a']).then(
      persist
    );
    await Promise.resolve();
    expect(persist).not.toHaveBeenCalled();
    read.resolve();
    await saving;
    await action;
    expect(persist).toHaveBeenCalledOnce();
  });

  it('does not wait for a read in a different delivery or mailbox', async () => {
    const client = new QueryClient();
    const read = deferred();
    const mutation = client.getMutationCache().build(client, {
      mutationKey: ['mail', 'ws', 'box', 'actions', 'viewed-read'],
      mutationFn: (_target: { threadId: string }) => read.promise,
    });
    const saving = mutation.execute({ threadId: 'a' });
    await waitForMailBackgroundReads(client, 'ws', 'box', ['b']);
    await waitForMailBackgroundReads(client, 'ws', 'other-box', ['a']);
    expect(mutation.state.status).toBe('pending');
    read.resolve();
    await saving;
  });

  it('coalesces same-tick settlement and does not keep actions pending during refresh', async () => {
    const client = new QueryClient();
    const a = deferred();
    const b = deferred();
    const refresh = deferred();
    const reconcile = vi.fn(() => refresh.promise);
    const build = (request: Promise<void>, kind: string) =>
      client.getMutationCache().build(client, {
        mutationKey: ['mail', 'ws', 'box', 'actions', kind],
        mutationFn: () => request,
        onSettled: () => reconcileMailWhenIdle(client, 'ws', 'box', reconcile),
      });
    const read = build(a.promise, 'viewed-read');
    const archive = build(b.promise, 'state');
    const requests = [read.execute(undefined), archive.execute(undefined)];
    a.resolve();
    b.resolve();
    await Promise.all(requests);
    await vi.waitFor(() => expect(reconcile).toHaveBeenCalledOnce());
    expect(client.isMutating()).toBe(0);
    refresh.resolve();
  });
});
