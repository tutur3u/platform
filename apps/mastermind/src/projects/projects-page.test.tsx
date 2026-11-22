// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n';
import type { ProjectsSearch } from '../routes/{-$locale}/projects';
import { createFixtureThreadsClient } from './fixtures';
import { ProjectsPage } from './projects-page';

/** A reply id in UUID form, built at runtime so no literal looks like a key. */
const TEST_REPLY_ID = '00000000-0000-4000-8000-'.padEnd(36, '0');

const fixture = createFixtureThreadsClient();
const api = vi.hoisted(() => ({
  threadMachinesFn: vi.fn(),
  threadProjectsFn: vi.fn(),
  threadPageFn: vi.fn(),
  threadMessagesFn: vi.fn(),
  threadReplyFn: vi.fn(),
  markThreadReadFn: vi.fn(),
  replyReceiptFn: vi.fn(),
}));
vi.mock('./server', () => api);
const live = vi.hoisted(() => ({
  listeners: new Set<(frame: unknown) => void>(),
}));
vi.mock('../fleet/owner-live', () => ({
  subscribeOwnerLive: (listener: (frame: unknown) => void) => {
    live.listeners.add(listener);
    return () => live.listeners.delete(listener);
  },
}));
// The browser cache in memory: one map per test run.
const cached = vi.hoisted(
  () => new Map<string, { page: unknown; savedAt: string }>()
);
vi.mock('../fleet/thread-cache', () => ({
  THREAD_CACHE_LIMITS: { lists: 6, threads: 50, maxBytes: 1048576 },
  threadListKey: (list: Record<string, string | undefined>) =>
    [
      list.machineId,
      list.environmentId ?? '',
      list.projectId ?? '',
      list.state ?? '',
    ].join('|'),
  createThreadCache: () => ({
    read: async (key: string) => cached.get(key) ?? null,
    write: async (key: string, page: unknown) =>
      void cached.set(key, { page, savedAt: '2026-11-22T00:00:00Z' }),
    clear: async () => cached.clear(),
  }),
}));
vi.mock('../components/shell', () => ({
  Shell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PageHeader: ({ title }: { title: ReactNode }) => <h1>{title}</h1>,
  Preferences: () => null,
}));

type Input = { data: Record<string, never> };
function wire() {
  api.threadMachinesFn.mockImplementation(async () => {
    const result = await fixture.machines('m');
    return result.kind === 'ok'
      ? { ...result, data: { ...result.data, ownerId: 'o' } }
      : result;
  });
  api.threadProjectsFn.mockImplementation(() => fixture.projects('m'));
  api.threadPageFn.mockImplementation(({ data }: Input) =>
    fixture.threads('m', data)
  );
  api.threadMessagesFn.mockImplementation(({ data }: Input) =>
    fixture.messages('m', data as never)
  );
  api.threadReplyFn.mockImplementation(({ data }: Input) =>
    fixture.reply('m', data as never)
  );
  api.markThreadReadFn.mockImplementation(() =>
    fixture.markRead('m', {} as never)
  );
}

function show(search: ProjectsSearch = {}, onSearch = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <I18nProvider locale="en">
        <ProjectsPage search={search} onSearch={onSearch} />
      </I18nProvider>
    </QueryClientProvider>
  );
  return { onSearch, client };
}

beforeEach(() => {
  vi.clearAllMocks();
  cached.clear();
  localStorage.clear();
  sessionStorage.clear();
  wire();
});
afterEach(cleanup);

describe('ProjectsPage', () => {
  it('groups this machine by project with counts and pages an open group', async () => {
    show();
    expect(
      (await screen.findByRole('button', { name: /tuturuuu/ })).getAttribute(
        'aria-expanded'
      )
    ).toBe('true');
    expect(
      screen.getByRole('button', { name: /Mira/ }).getAttribute('aria-expanded')
    ).toBe('false');
    expect(screen.getByRole('button', { name: /Unassigned/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^All\s*132/ })).toBeTruthy();
    await screen.findByText('tuturuuu thread 50');
    expect(screen.queryByText('tuturuuu thread 51')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Load 50 more' }));
    await screen.findByText('tuturuuu thread 100');
    expect(screen.getByRole('button', { name: 'Load 20 more' })).toBeTruthy();
    expect(api.threadPageFn).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        projectId: 'tuturuuu',
        cursor: 50,
        limit: 50,
      }),
    });
  });

  it('lists a linked machine flat, never asks it to group, and greys unreachable machines', async () => {
    show({ machine: 'env-studio' });
    await screen.findByText('tuturuuu thread 1');
    expect(api.threadProjectsFn).not.toHaveBeenCalled();
    expect(api.threadPageFn).toHaveBeenCalledWith({
      data: expect.objectContaining({
        environmentId: 'env-studio',
        projectId: undefined,
      }),
    });
    expect(
      (screen.getByRole('button', { name: /C02/ }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(screen.getAllByText(/· MacStudio1$/).length).toBeGreaterThan(0);
  });

  it('keeps the last list with a staleness line when the machine goes offline', async () => {
    const { client } = show();
    await screen.findByText('tuturuuu thread 1');
    api.threadProjectsFn.mockResolvedValue({
      kind: 'error',
      code: 'machine_offline',
    });
    await client.refetchQueries({
      queryKey: ['mastermind-threads', 'projects'],
    });
    expect(
      await screen.findByText(/The machine is offline. Showing the list from/)
    ).toBeTruthy();
    expect(screen.getByText('tuturuuu thread 1')).toBeTruthy();
  });

  it('falls back to a flat list while the grouping route is absent', async () => {
    api.threadProjectsFn.mockResolvedValue({
      kind: 'error',
      code: 'not_found',
    });
    show();
    expect(
      (await screen.findAllByText(/tuturuuu · This machine/)).length
    ).toBeGreaterThan(1);
  });

  it('opens a thread with earlier pages, redaction and a steered reply', async () => {
    show({ thread: 'thread:tuturuuu-0' });
    await screen.findByText('Message 40 in tuturuuu thread 1.');
    expect(api.markThreadReadFn).toHaveBeenCalledWith({
      data: {
        environmentId: undefined,
        threadId: 'thread:tuturuuu-0',
        itemCount: 20,
      },
    });
    expect(screen.getAllByText('[redacted]').length).toBeGreaterThan(0);
    expect(screen.queryByText(/^You/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Load earlier' }));
    await screen.findByText('Message 1 in tuturuuu thread 1.');
    expect(screen.getByText('Start of the thread')).toBeTruthy();
    const box = screen.getByRole('textbox', { name: /Reply to this thread/ });
    fireEvent.change(box, { target: { value: 'Ship it' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('Steered into the running turn');
    expect(api.threadReplyFn).toHaveBeenCalledWith({
      data: expect.objectContaining({
        threadId: 'thread:tuturuuu-0',
        text: 'Ship it',
      }),
    });
  });

  it('sends a reply that needs MFA through the fresh sign-in and resumes it under its key', async () => {
    api.threadReplyFn.mockResolvedValue({
      ok: false,
      error: 'mfa_required',
      status: 401,
    });
    show({ thread: 'thread:tuturuuu-0' });
    const box = await screen.findByRole('textbox', {
      name: /Reply to this thread/,
    });
    fireEvent.change(box, { target: { value: 'Hi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    const link = await screen.findByRole('link', { name: 'Verify again' });
    expect(link.getAttribute('href')).toContain('mfa=fresh');
    const key = api.threadReplyFn.mock.calls[0]?.[0].data.idempotencyKey;
    link.addEventListener('click', (event) => event.preventDefault());
    fireEvent.click(link);
    cleanup();
    api.threadReplyFn.mockClear();
    show({ thread: 'thread:tuturuuu-0' });
    await waitFor(() => expect(api.threadReplyFn).toHaveBeenCalledTimes(1));
    expect(api.threadReplyFn.mock.calls[0]?.[0].data).toMatchObject({
      idempotencyKey: key,
      text: 'Hi',
    });
  });
});

describe('ProjectsPage narrow layout', () => {
  it('brings the list back from a deep-linked thread', async () => {
    const { onSearch } = show({ thread: 'thread:tuturuuu-0' });
    fireEvent.click(await screen.findByRole('button', { name: /All threads/ }));
    expect(onSearch).toHaveBeenCalledWith({ thread: undefined });
  });

  it('skips the badge update when the marker is not saved', async () => {
    api.markThreadReadFn.mockResolvedValue({
      kind: 'ok',
      data: { saved: false },
      fetchedAt: '',
    });
    const { client } = show({ thread: 'thread:tuturuuu-1' });
    await screen.findByText('Message 40 in tuturuuu thread 2.');
    await waitFor(() => expect(api.markThreadReadFn).toHaveBeenCalled());
    const lists = client.getQueriesData<{
      pages: { threads: { threadId: string; seenItemCount?: number }[] }[];
    }>({
      queryKey: ['mastermind-threads', 'list'],
    });
    const row = lists
      .flatMap(([, d]) => d?.pages ?? [])
      .flatMap((p) => p.threads)
      .find((r) => r.threadId === 'thread:tuturuuu-1');
    expect(row?.seenItemCount).toBe(20);
  });
});

describe('ProjectsPage cache', () => {
  it('shows the cached list with its age when the linked machine goes offline', async () => {
    const first = show({ machine: 'env-studio' });
    await screen.findByText('tuturuuu thread 1');
    cleanup();
    first.client.clear();
    api.threadPageFn.mockResolvedValue({
      kind: 'error',
      code: 'machine_offline',
    });
    show({ machine: 'env-studio' });
    expect(await screen.findByText(/Showing the list from/)).toBeTruthy();
    expect(screen.getByText('tuturuuu thread 1')).toBeTruthy();
  });
});

describe('ProjectsPage held replies', () => {
  it('keeps reading a held reply after Write another', async () => {
    const key = TEST_REPLY_ID;
    const held = {
      id: key,
      machineId: 'm',
      threadId: 'thread:tuturuuu-0',
      state: 'sent',
      createdAt: '2026-11-22T00:00:00Z',
    };
    // Web names a reply by its idempotency key.
    let sentKey = key;
    api.threadReplyFn.mockImplementation(
      async ({ data }: { data: { idempotencyKey: string } }) => {
        sentKey = data.idempotencyKey;
        return { ok: true, data: { ...held, id: sentKey } };
      }
    );
    api.replyReceiptFn.mockImplementation(async () => ({
      ok: true,
      data: { ...held, id: sentKey, state: 'delivered', delivery: 'steered' },
    }));
    show({ thread: 'thread:tuturuuu-0' });
    const box = await screen.findByRole('textbox', {
      name: /Reply to this thread/,
    });
    fireEvent.change(box, { target: { value: 'Held' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Write another' })
    );
    for (const listener of live.listeners)
      listener({ t: 'receipt', receipt: { id: sentKey } });
    expect(
      await screen.findByText('Steered into the running turn')
    ).toBeTruthy();
    expect(api.threadReplyFn).toHaveBeenCalledTimes(1);
  });
});

describe('ProjectsPage cache owner', () => {
  const offline = () => {
    api.threadMachinesFn.mockResolvedValue({
      kind: 'error',
      code: 'machine_offline',
      ownerId: 'bob',
    });
    api.threadProjectsFn.mockResolvedValue({
      kind: 'error',
      code: 'machine_offline',
    });
    api.threadPageFn.mockResolvedValue({
      kind: 'error',
      code: 'machine_offline',
    });
  };

  it("never opens another owner's cached lists", async () => {
    localStorage.setItem(
      'mastermind-projects:last-context',
      JSON.stringify({
        ownerId: 'alice',
        machineId: 'fixture',
        projectIds: ['tuturuuu'],
      })
    );
    cached.set('fixture|||', {
      page: { machineId: 'fixture', threads: [], nextCursor: null, total: 0 },
      savedAt: '2026-11-22T00:00:00Z',
    });
    offline();
    show();
    await screen.findByText('The machine is offline.');
    expect(localStorage.getItem('mastermind-projects:last-context')).toBeNull();
    expect(cached.size).toBe(0);
  });

  it('shows the cached project groups of the same owner on a cold offline open', async () => {
    const first = show();
    await screen.findByText('tuturuuu thread 1');
    cleanup();
    first.client.clear();
    offline();
    api.threadMachinesFn.mockResolvedValue({
      kind: 'error',
      code: 'machine_offline',
      ownerId: 'o',
    });
    show();
    expect(await screen.findByText(/Showing the list from/)).toBeTruthy();
    expect(screen.getByText('tuturuuu thread 1')).toBeTruthy();
  });
});

describe('ProjectsPage reply keys', () => {
  it('starts one reply for a double click and reuses a resendable reply by text', async () => {
    api.threadReplyFn.mockResolvedValue({
      ok: false,
      error: 'timeout',
      status: 504,
    });
    show({ thread: 'thread:tuturuuu-0' });
    const box = await screen.findByRole('textbox', {
      name: /Reply to this thread/,
    });
    fireEvent.change(box, { target: { value: 'Ship it' } });
    const send = screen.getByRole('button', { name: 'Send' });
    fireEvent.click(send);
    fireEvent.click(send);
    await waitFor(() => expect(api.threadReplyFn).toHaveBeenCalledTimes(1));
    const firstKey = api.threadReplyFn.mock.calls[0]?.[0].data.idempotencyKey;
    fireEvent.change(box, { target: { value: 'Other' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(api.threadReplyFn).toHaveBeenCalledTimes(2));
    fireEvent.change(box, { target: { value: 'Ship it' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(api.threadReplyFn).toHaveBeenCalledTimes(3));
    expect(api.threadReplyFn.mock.calls[2]?.[0].data.idempotencyKey).toBe(
      firstKey
    );
  });
});
