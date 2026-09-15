import { QueryClient } from '@tanstack/react-query';
import type { MailThreadDetail } from '@tuturuuu/internal-api';
import { expect, it } from 'vitest';
import {
  restoreMailThreads,
  snapshotMailThreads,
} from './mail-thread-optimistic';

it('updates restored reader counts without a loaded list and restores them on failure', async () => {
  const queryClient = new QueryClient();
  const key = ['mail', 'ws', 'box', 'thread', 'thread'];
  const detail = {
    thread: { id: 'thread', unreadCount: 205, inboundCount: 210 },
    messages: [{ id: 'a', unread: true, direction: 'inbound' }],
  } as MailThreadDetail;
  queryClient.setQueryData(key, detail);
  queryClient.setQueryData(['mail', 'ws', 'bootstrap-counts'], { box: 207 });
  const context = await snapshotMailThreads({
    queryClient,
    activeMailboxId: 'box',
    workspaceId: 'ws',
    ids: new Set(['thread']),
    action: 'mark_read',
    folder: 'inbox',
    threads: [],
  });
  expect(queryClient.getQueryData(['mail', 'ws', 'bootstrap-counts'])).toEqual({
    box: 2,
  });
  expect(
    queryClient.getQueryData<MailThreadDetail>(key)?.thread.unreadCount
  ).toBe(0);
  restoreMailThreads(queryClient, context);
  expect(queryClient.getQueryData(key)).toEqual(detail);
  expect(queryClient.getQueryData(['mail', 'ws', 'bootstrap-counts'])).toEqual({
    box: 207,
  });
});

it('marks only inbound messages unread and adds the full incoming count optimistically', async () => {
  const queryClient = new QueryClient();
  const key = ['mail', 'ws', 'box', 'thread', 'thread'];
  const detail = {
    thread: { id: 'thread', unreadCount: 0, inboundCount: 205 },
    messages: [
      { id: 'in', unread: false, direction: 'inbound' },
      { id: 'out', unread: false, direction: 'outbound' },
    ],
  } as MailThreadDetail;
  queryClient.setQueryData(key, detail);
  queryClient.setQueryData(['mail', 'ws', 'bootstrap-counts'], { box: 2 });
  const context = await snapshotMailThreads({
    queryClient,
    activeMailboxId: 'box',
    workspaceId: 'ws',
    ids: new Set(['thread']),
    action: 'mark_unread',
    folder: 'inbox',
    threads: [],
  });
  expect(
    queryClient
      .getQueryData<MailThreadDetail>(key)
      ?.messages.map((message) => message.unread)
  ).toEqual([true, false]);
  expect(
    queryClient.getQueryData<MailThreadDetail>(key)?.thread.unreadCount
  ).toBe(205);
  expect(queryClient.getQueryData(['mail', 'ws', 'bootstrap-counts'])).toEqual({
    box: 207,
  });
  restoreMailThreads(queryClient, context);
  expect(queryClient.getQueryData(key)).toEqual(detail);
  expect(queryClient.getQueryData(['mail', 'ws', 'bootstrap-counts'])).toEqual({
    box: 2,
  });
});
