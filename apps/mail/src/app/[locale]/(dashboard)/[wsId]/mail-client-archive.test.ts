// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { MailThreadSummary } from '@tuturuuu/internal-api';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import { toast } from '@tuturuuu/ui/sonner';
import { withNuqsTestingAdapter } from 'nuqs/adapters/testing';
import { createElement } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../messages/en.json';
import { MailAppClient } from './mail-client';
import { getMailThreadsQueryKey } from './mail-thread-query';
import { MailboxSelectionProvider } from './mailbox-selection';

type MailTextKey = {
  [
    Key in keyof typeof messages.mail
  ]: (typeof messages.mail)[Key] extends string ? Key : never;
}[keyof typeof messages.mail];

const api = vi.hoisted(() => ({
  list: vi.fn(),
  update: vi.fn(),
  detail: vi.fn(),
  bootstrap: vi.fn(),
  organization: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  listMailThreads: api.list,
  updateMailThreadState: api.update,
  getMailThread: api.detail,
  getMailBootstrap: api.bootstrap,
  getMailboxOrganization: api.organization,
  getMailUnreadCounts: vi.fn(async () => ({ box: 0 })),
  listWorkspaceMembers: vi.fn(async () => []),
  getMailInvitation: vi.fn(async () => ({ invitation: null })),
  bulkUpdateMailThreads: vi.fn(),
  deleteMailDraft: vi.fn(),
  sendMailMessage: vi.fn(),
}));
const bootstrap = (...ids: string[]) => ({
  mailboxes: ids.map((id) => ({
    id,
    address: id === 'box' ? 'guest@example.test' : `${id}@example.test`,
    unreadCount: 0,
    role: 'owner',
    status: 'active',
  })),
  labels: [],
  user: { id: 'actor', email: 'guest@example.test' },
});
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTimeZone: () => 'UTC',
  useTranslations: () => (key: MailTextKey, values?: Record<string, string>) =>
    Object.entries(values ?? {}).reduce(
      (text, [name, value]) => text.replace(`{${name}}`, value),
      messages.mail[key] ?? key
    ),
}));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));
// jsdom does not apply the desktop/mobile CSS breakpoint. Keep the actual mobile
// inbox/reader tree and omit only the duplicate desktop layout wrapper.
vi.mock('@tuturuuu/ui/resizable', () => ({
  ResizablePanelGroup: () => null,
  ResizablePanel: () => null,
  ResizableHandle: () => null,
}));
vi.mock('./floating-composer', () => ({ FloatingComposer: () => null }));
vi.mock('./mail-label-menu', () => ({ MailLabelMenu: () => null }));
vi.mock('./mail-mark-folder-read', () => ({ MailMarkFolderRead: () => null }));
vi.mock('./mail-blacklist-control', () => ({
  MailBlacklistControl: () => null,
}));
vi.mock('./mail-keyboard-help', () => ({ MailKeyboardHelp: () => null }));

const thread: MailThreadSummary = {
  id: 'last',
  mailboxId: 'box',
  subject: 'Synthetic last message',
  status: 'active',
  messageCount: 1,
  unreadCount: 0,
  inboundCount: 1,
  inboxInboundCount: 1,
  lastMessageAt: '2026-09-30T12:00:00Z',
  hasAttachments: false,
  labels: [],
  latestMessageId: 'message',
  latestSnippet: 'Synthetic body',
  participants: [
    { address: 'host@example.test', displayName: 'Synthetic Host' },
  ],
  starred: false,
};
const key = getMailThreadsQueryKey({
  folder: 'inbox',
  mailboxId: 'box',
  workspaceId: 'ws',
});
const page = (threads: MailThreadSummary[]) => ({
  threads,
  pagination: { page: 1, pageSize: 40, total: threads.length, hasMore: false },
});
let serverRows: MailThreadSummary[];
let client: QueryClient;
function deferred() {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  window.matchMedia ??= (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  });
  serverRows = [thread];
  api.bootstrap.mockResolvedValue(bootstrap('box'));
  api.organization.mockResolvedValue({ folders: [], labels: [] });
  api.list.mockImplementation(async () => page(serverRows));
  api.detail.mockResolvedValue({
    thread,
    messages: [
      {
        id: 'message',
        mailboxId: 'box',
        threadId: 'last',
        subject: thread.subject,
        direction: 'inbound',
        status: 'received',
        unread: false,
        starred: false,
        createdAt: thread.lastMessageAt,
        receivedAt: thread.lastMessageAt,
        fromAddress: 'host@example.test',
        fromName: 'Synthetic Host',
        bodyText: 'Synthetic body',
        sanitizedHtml: null,
        bodyHtml: null,
        attachments: [],
        labels: [],
        recipients: [],
        safeHeaders: {},
        references: [],
      },
    ],
  });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.clearAllMocks();
  window.localStorage.clear();
});
function renderMail(searchParams: Record<string, string>) {
  const urlUpdate = vi.fn();
  render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(
        MailboxSelectionProvider,
        { workspaceId: 'ws' },
        createElement(MailAppClient, { folder: 'inbox', workspaceId: 'ws' })
      )
    ),
    {
      wrapper: withNuqsTestingAdapter({
        searchParams,
        hasMemory: true,
        onUrlUpdate: urlUpdate,
      }),
    }
  );
  return urlUpdate;
}

async function mountAndArchive(pending: ReturnType<typeof deferred>) {
  api.update.mockReturnValue(pending.promise);
  renderMail({ mailbox: 'box' });
  await waitFor(() =>
    expect(
      document.querySelector('[data-mail-thread-open="last"]')
    ).not.toBeNull()
  );
  fireEvent.click(document.querySelector('[data-mail-thread-open="last"]')!);
  await screen.findByText('Synthetic body', { selector: 'pre' });
  fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
  await waitFor(() => expect(api.update).toHaveBeenCalledTimes(1));
  await screen.findByText(messages.mail.empty);
  expect(
    screen.queryByRole('status', { name: messages.mail.loading })
  ).toBeNull();
  expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();
}
it('archives the final inbox row to a stable empty state and stays empty after successful reconciliation', async () => {
  const pending = deferred();
  await mountAndArchive(pending);
  serverRows = [];
  await act(async () => {
    pending.resolve({});
  });
  await waitFor(() => expect(client.isMutating()).toBe(0));
  await act(async () => {
    await client.refetchQueries({ queryKey: key });
  });
  expect(screen.getByText(messages.mail.empty)).toBeTruthy();
  expect(
    screen.queryByRole('status', { name: messages.mail.loading })
  ).toBeNull();
});
it('rolls back a failed final archive, reopens the actual reader, and permits a successful retry', async () => {
  const pending = deferred();
  await mountAndArchive(pending);
  await act(async () => {
    pending.reject(new Error('Synthetic archive failure'));
  });
  await screen.findByRole('button', { name: 'Archive' });
  expect(screen.getByText('Synthetic body', { selector: 'pre' })).toBeTruthy();
  const retry = deferred();
  api.update.mockReturnValue(retry.promise);
  fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
  await waitFor(() => expect(api.update).toHaveBeenCalledTimes(2));
  await screen.findByText(messages.mail.empty);
  serverRows = [];
  await act(async () => {
    retry.resolve({});
  });
  await waitFor(() => expect(client.isMutating()).toBe(0));
  expect(screen.getByText(messages.mail.empty)).toBeTruthy();
});
it('keeps the pending archived row hidden after reader exit and stale refresh while retaining a new arrival', async () => {
  const pending = deferred();
  await mountAndArchive(pending);
  const arrival = { ...thread, id: 'new', subject: 'Synthetic new arrival' };
  serverRows = [thread, arrival];
  await act(async () => {
    await client.refetchQueries({ queryKey: key });
  });
  await waitFor(() =>
    expect(
      document.querySelector('[data-mail-thread-open="new"]')
    ).not.toBeNull()
  );
  expect(document.querySelector('[data-mail-thread-open="last"]')).toBeNull();
  serverRows = [arrival];
  await act(async () => {
    pending.resolve({});
  });
  await waitFor(() => expect(client.isMutating()).toBe(0));
  expect(document.querySelector('[data-mail-thread-open="last"]')).toBeNull();
});

it('preserves new arrivals when a refreshed pending archive fails and restores the reader for retry', async () => {
  const pending = deferred();
  await mountAndArchive(pending);
  const arrival = { ...thread, id: 'new', subject: 'Synthetic new arrival' };
  serverRows = [thread, arrival];
  await act(async () => {
    await client.refetchQueries({ queryKey: key });
  });
  await waitFor(() =>
    expect(
      document.querySelector('[data-mail-thread-open="new"]')
    ).not.toBeNull()
  );
  expect(document.querySelector('[data-mail-thread-open="last"]')).toBeNull();
  await act(async () => {
    pending.reject(new Error('Synthetic failure after refresh'));
  });
  await screen.findByRole('button', { name: 'Archive' });
  expect(screen.getByText('Synthetic body', { selector: 'pre' })).toBeTruthy();
  fireEvent.click(
    screen.getByRole('button', { name: messages.mail.back_to_messages })
  );
  await waitFor(() =>
    expect(
      document.querySelector('[data-mail-thread-open="last"]')
    ).not.toBeNull()
  );
  expect(
    document.querySelector('[data-mail-thread-open="new"]')
  ).not.toBeNull();
  expect(
    screen.queryByRole('status', { name: messages.mail.loading })
  ).toBeNull();
});

for (const outcome of ['success', 'failure'] as const) {
  it(`retains a newer message in the same conversation during pending archive and ${outcome}`, async () => {
    const pending = deferred();
    await mountAndArchive(pending);
    const arrival = {
      ...thread,
      latestMessageId: 'new-inbound-after-archive',
      lastMessageAt: '2026-09-30T12:01:00Z',
      messageCount: 2,
      inboxInboundCount: 1,
      unreadCount: 1,
      latestSnippet: 'New same-conversation message',
    };
    serverRows = [arrival];
    await act(async () => {
      await client.refetchQueries({ queryKey: key });
    });
    await waitFor(() =>
      expect(
        document.querySelector('[data-mail-thread-open="last"]')
      ).not.toBeNull()
    );
    expect(
      client.getQueryData<{ pages: ReturnType<typeof page>[] }>(key)?.pages[0]
        ?.threads[0]?.latestMessageId
    ).toBe(arrival.latestMessageId);
    await act(async () => {
      if (outcome === 'success') pending.resolve({});
      else pending.reject(new Error('Synthetic old-message archive failure'));
    });
    await waitFor(() => expect(client.isMutating()).toBe(0));
    expect(
      client.getQueryData<{ pages: ReturnType<typeof page>[] }>(key)?.pages[0]
        ?.threads[0]?.latestMessageId
    ).toBe(arrival.latestMessageId);
    if (outcome === 'failure') {
      await screen.findByRole('button', { name: 'Archive' });
      const retry = deferred();
      api.update.mockReturnValue(retry.promise);
      fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
      await waitFor(() => expect(api.update).toHaveBeenCalledTimes(2));
      await screen.findByText(messages.mail.empty);
      await act(async () => {
        await client.refetchQueries({ queryKey: key });
      });
      expect(
        document.querySelector('[data-mail-thread-open="last"]')
      ).toBeNull();
      serverRows = [];
      await act(async () => {
        retry.resolve({});
      });
      await waitFor(() => expect(client.isMutating()).toBe(0));
    }
  });
}

it.each(['threads', 'organization'])(
  'recovers from selected mailbox %s denial without retrying it',
  async (source) => {
    api.bootstrap.mockResolvedValue(bootstrap('first', 'denied', 'later'));
    const forbidden = new InternalApiError('Forbidden', 403);
    api.list.mockImplementation(async (_workspace, id) => {
      if (source === 'threads' && id === 'denied') throw forbidden;
      return page(id === 'first' ? [{ ...thread, mailboxId: id }] : []);
    });
    api.organization.mockImplementation(async (_workspace, id) => {
      if (source === 'organization' && id === 'denied') throw forbidden;
      return { folders: [], labels: [] };
    });
    const update = renderMail({
      mailbox: 'denied',
      label: 'old',
      folderId: 'old',
    });
    await screen.findByText(thread.subject);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        queryString: '?mailbox=first',
      })
    );
    expect(toast.warning).toHaveBeenCalledExactlyOnceWith(
      messages.mail.mailbox_access_switched,
      expect.anything()
    );
    const requests = source === 'threads' ? api.list : api.organization;
    expect(
      requests.mock.calls.filter(([, id]) => id === 'denied')
    ).toHaveLength(1);
    expect(api.list.mock.calls.some(([, id]) => id === 'later')).toBe(false);
  }
);

it('clears the URL and shows the empty mailbox state when all choices are denied', async () => {
  api.bootstrap.mockResolvedValue(bootstrap('first', 'denied'));
  api.list.mockRejectedValue(new InternalApiError('Forbidden', 403));
  const update = renderMail({ mailbox: 'denied' });
  await screen.findByText(messages.mail.no_mailboxes);
  expect(update).toHaveBeenLastCalledWith(
    expect.objectContaining({ queryString: '' })
  );
  expect(api.list.mock.calls.map(([, id]) => id)).toEqual(['denied', 'first']);
  expect(toast.warning).toHaveBeenCalledTimes(1);
});

it('shows the translated timeout message and offers a manual retry', async () => {
  api.list.mockRejectedValueOnce(
    new InternalApiError('Mail read timed out', 503, 'MAIL_READ_TIMEOUT')
  );
  renderMail({ mailbox: 'box' });
  await screen.findByText(messages.mail.read_timeout_description);
  expect(api.list).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: messages.mail.retry }));
  await screen.findByText(thread.subject);
  expect(api.list).toHaveBeenCalledTimes(2);
});

it('clears a denied hint before bootstrap and remembers the first discovered mailbox', async () => {
  const hintKey = 'tuturuuu-mail-default-mailbox:ws';
  window.localStorage.setItem(hintKey, 'denied');
  const discovery = deferred();
  api.bootstrap.mockReturnValue(discovery.promise);
  api.list.mockImplementation(async (_workspace, id) => {
    if (id === 'denied') throw new InternalApiError('Forbidden', 403);
    return page([{ ...thread, mailboxId: id }]);
  });
  const update = renderMail({});
  await waitFor(() => expect(window.localStorage.getItem(hintKey)).toBeNull());
  expect(api.list.mock.calls.map(([, id]) => id)).toEqual(['denied']);
  expect(toast.warning).not.toHaveBeenCalled();

  await act(async () => discovery.resolve(bootstrap('denied', 'first')));
  await screen.findByText(thread.subject);
  expect(window.localStorage.getItem(hintKey)).toBe('first');
  expect(update).toHaveBeenLastCalledWith(
    expect.objectContaining({ queryString: '?mailbox=first' })
  );
  expect(api.list.mock.calls.map(([, id]) => id)).toEqual(['denied', 'first']);
  expect(toast.warning).toHaveBeenCalledTimes(1);
});
