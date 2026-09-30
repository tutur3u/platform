import { QueryClient } from '@tanstack/react-query';
import type { MailThreadsResponse } from '@tuturuuu/internal-api';
import { afterEach, expect, it, vi } from 'vitest';
import { loadMailThreadPage } from './mail-thread-page-query';

const api = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('@tuturuuu/internal-api', () => ({ listMailThreads: api.list }));
afterEach(() => vi.clearAllMocks());
const scope = { workspaceId: 'ws', mailboxId: 'box', folder: 'inbox' as const };
const rows = {
  threads: [
    { id: 'last', unreadCount: 1, inboundCount: 1 },
    { id: 'new', unreadCount: 0 },
  ],
  pagination: { page: 2, pageSize: 40, total: 42, hasMore: false },
} as MailThreadsResponse;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function archive(client: QueryClient, ws = 'ws', mailbox = 'box') {
  const pending = deferred<void>();
  const mutation = client.getMutationCache().build(client, {
    mutationKey: ['mail', ws, mailbox, 'actions', 'state'],
    mutationFn: async () => pending.promise,
  });
  const done = mutation
    .execute({
      action: 'archive',
      targetThreadId: 'last',
      targetWorkspaceId: ws,
      mailboxId: mailbox,
    })
    .catch(() => undefined);
  return { pending, done };
}
it('replays an archive begun after a slow page request even when it succeeds before the response arrives', async () => {
  const client = new QueryClient();
  const request = deferred<MailThreadsResponse>();
  api.list.mockReturnValue(request.promise);
  const loading = loadMailThreadPage(client, scope, 2);
  const action = archive(client);
  action.pending.resolve();
  await action.done;
  request.resolve(rows);
  expect((await loading).threads.map((row) => row.id)).toEqual(['new']);
  expect(api.list).toHaveBeenCalledWith(
    'ws',
    'box',
    expect.objectContaining({ page: 2 })
  );
  client.clear();
});
it('does not replay a failed action into a delayed refreshed page', async () => {
  const client = new QueryClient();
  const request = deferred<MailThreadsResponse>();
  const action = archive(client);
  api.list.mockReturnValue(request.promise);
  const loading = loadMailThreadPage(client, scope, 2);
  action.pending.reject(new Error('Synthetic failure'));
  await action.done;
  request.resolve(rows);
  expect((await loading).threads.map((row) => row.id)).toEqual(['last', 'new']);
  client.clear();
});
it('isolates identical thread IDs in another workspace or mailbox', async () => {
  const client = new QueryClient();
  const elsewhere = [
    archive(client, 'other', 'box'),
    archive(client, 'ws', 'other'),
  ];
  api.list.mockResolvedValue(rows);
  expect(
    (await loadMailThreadPage(client, scope, 2)).threads.map((row) => row.id)
  ).toEqual(['last', 'new']);
  for (const action of elsewhere) {
    action.pending.resolve();
    await action.done;
  }
  client.clear();
});
it('retains a pending archive in the archive folder while filtering unread inbox results', async () => {
  const client = new QueryClient();
  const action = archive(client);
  api.list.mockResolvedValue(rows);
  expect(
    (
      await loadMailThreadPage(client, { ...scope, folder: 'archive' }, 2)
    ).threads.map((row) => row.id)
  ).toEqual(['last', 'new']);
  expect(
    (
      await loadMailThreadPage(client, { ...scope, query: 'is:unread' }, 2)
    ).threads.map((row) => row.id)
  ).toEqual(['new']);
  action.pending.resolve();
  await action.done;
  client.clear();
});
