import { QueryClient } from '@tanstack/react-query';
import type { MailThreadDetail } from '@tuturuuu/internal-api';
import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@tuturuuu/internal-api', () => ({ getMailThread: mocks.get }));

import { mailThreadDetailQuery } from './mail-thread-detail-query';

afterEach(() => vi.clearAllMocks());

it.each(['success', 'pending', 'error'] as const)(
  'preserves newer %s actions when the initial delivery body arrives',
  async (status) => {
    const client = new QueryClient();
    let resolve!: (value: MailThreadDetail) => void;
    mocks.get.mockReturnValue(
      new Promise<MailThreadDetail>((done) => {
        resolve = done;
      })
    );
    const loading = client.fetchQuery(
      mailThreadDetailQuery(client, 'ws', 'box', 'a')
    );
    let finish!: () => void;
    const mutation = client.getMutationCache().build(client, {
      mutationKey: ['mail', 'ws', 'box', 'actions', 'state'],
      mutationFn: async (_target: {
        targetThreadId: string;
        action: string;
      }) => {
        if (status === 'error') throw new Error('offline');
        if (status === 'pending')
          await new Promise<void>((done) => {
            finish = done;
          });
      },
    });
    const saving = mutation
      .execute({ targetThreadId: 'a', action: 'star' })
      .catch(() => {});
    if (status !== 'pending') await saving;
    else await vi.waitFor(() => expect(finish).toBeDefined());
    resolve({
      thread: { id: 'a' },
      messages: [{ id: 'm', starred: false }],
    } as MailThreadDetail);
    expect((await loading).messages[0]?.starred).toBe(status !== 'error');
    finish?.();
    await saving;
  }
);

it('never applies another grouped delivery action to the requested message', async () => {
  const client = new QueryClient();
  let resolve!: (value: MailThreadDetail) => void;
  mocks.get.mockReturnValue(
    new Promise<MailThreadDetail>((done) => {
      resolve = done;
    })
  );
  const loading = client.fetchQuery(
    mailThreadDetailQuery(client, 'ws', 'box', 'a')
  );
  await client
    .getMutationCache()
    .build(client, {
      mutationKey: ['mail', 'ws', 'box', 'actions', 'state'],
      mutationFn: async (_target: {
        targetThreadId: string;
        action: string;
      }) => {},
    })
    .execute({ targetThreadId: 'b', action: 'star' });
  resolve({
    thread: { id: 'a' },
    messages: [{ id: 'm', starred: false }],
  } as MailThreadDetail);
  expect((await loading).messages[0]?.starred).toBe(false);
});
