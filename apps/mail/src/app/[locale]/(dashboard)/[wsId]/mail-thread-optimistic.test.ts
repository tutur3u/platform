import { QueryClient } from '@tanstack/react-query';
import type {
  MailThreadDetail,
  MailThreadSummary,
} from '@tuturuuu/internal-api';
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

it('retains the one-message unread fallback for old list-only caches', async () => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(['mail', 'ws', 'bootstrap-counts'], { box: 0 });
  await snapshotMailThreads({
    queryClient,
    activeMailboxId: 'box',
    workspaceId: 'ws',
    ids: new Set(['thread']),
    action: 'mark_unread',
    folder: 'inbox',
    threads: [{ id: 'thread', unreadCount: 0 }] as never,
  });
  expect(queryClient.getQueryData(['mail', 'ws', 'bootstrap-counts'])).toEqual({
    box: 1,
  });
});

it('adjusts only Inbox messages when a mixed-folder conversation is read from Starred', async () => {
  const queryClient = new QueryClient();
  const key = ['mail', 'ws', 'box', 'thread', 'thread'];
  const thread = {
    id: 'thread',
    unreadCount: 8,
    inboundCount: 10,
    inboxUnreadCount: 2,
    inboxInboundCount: 3,
  };
  queryClient.setQueryData(key, { thread, messages: [] });
  queryClient.setQueryData(['mail', 'ws', 'bootstrap-counts'], { box: 5 });
  const context = await snapshotMailThreads({
    queryClient,
    activeMailboxId: 'box',
    workspaceId: 'ws',
    ids: new Set(['thread']),
    action: 'mark_read',
    folder: 'starred',
    threads: [],
  });
  expect(queryClient.getQueryData(['mail', 'ws', 'bootstrap-counts'])).toEqual({
    box: 3,
  });
  expect(
    queryClient.getQueryData<MailThreadDetail>(key)?.thread.unreadCount
  ).toBe(0);
  await snapshotMailThreads({
    queryClient,
    activeMailboxId: 'box',
    workspaceId: 'ws',
    ids: new Set(['thread']),
    action: 'mark_unread',
    folder: 'starred',
    threads: [],
  });
  expect(queryClient.getQueryData(['mail', 'ws', 'bootstrap-counts'])).toEqual({
    box: 6,
  });
  expect(
    queryClient.getQueryData<MailThreadDetail>(key)?.thread.unreadCount
  ).toBe(10);
  expect(context?.unreadDelta).toBe(2);
});

it('restores counts only for failed bulk rows still owned by that operation', async () => {
  const client = new QueryClient();
  const threads = ['a', 'b'].map((id) => ({
    id,
    unreadCount: 1,
    inboundCount: 1,
  })) as MailThreadSummary[];
  const key = ['mail', 'ws', 'box', 'threads', 'inbox', null, null, ''];
  client.setQueryData(key, {
    pages: [{ threads, pagination: { total: 2 } }],
    pageParams: [1],
  });
  client.setQueryData(['mail', 'ws', 'bootstrap-counts'], { box: 2 });
  const shared = {
    queryClient: client,
    workspaceId: 'ws',
    activeMailboxId: 'box',
    folder: 'inbox' as const,
    threads,
  };
  const bulk = await snapshotMailThreads({
    ...shared,
    ids: new Set(['a', 'b']),
    action: 'mark_read',
  });
  await snapshotMailThreads({ ...shared, ids: new Set(['b']), action: 'star' });
  restoreMailThreads(client, bulk);
  expect(client.getQueryData(['mail', 'ws', 'bootstrap-counts'])).toEqual({
    box: 1,
  });
  const result = client.getQueryData<{
    pages: { threads: MailThreadSummary[] }[];
  }>(key)?.pages[0]?.threads;
  expect(result?.find((thread) => thread.id === 'a')?.unreadCount).toBe(1);
  expect(result?.find((thread) => thread.id === 'b')).toMatchObject({
    unreadCount: 0,
    starred: true,
  });
});
