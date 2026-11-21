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
import type { ProjectsSearch } from '../routes/$locale_.projects';
import { createFixtureThreadsClient } from './fixtures';
import { ProjectsPage } from './projects-page';

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
vi.mock('../fleet/owner-live', () => ({ subscribeOwnerLive: () => () => {} }));
vi.mock('../components/shell', () => ({
  Shell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PageHeader: ({ title }: { title: ReactNode }) => <h1>{title}</h1>,
  Preferences: () => null,
}));

type Input = { data: Record<string, never> };
function wire() {
  api.threadMachinesFn.mockImplementation(() => fixture.machines('m'));
  api.threadProjectsFn.mockImplementation(({ data }: Input) =>
    fixture.projects('m', (data as { environmentId?: string }).environmentId)
  );
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

  it('asks for a fresh sign-in when sending needs MFA', async () => {
    api.threadReplyFn.mockResolvedValue({
      kind: 'error',
      code: 'mfa_required',
    });
    show({ thread: 'thread:tuturuuu-0' });
    const box = await screen.findByRole('textbox', {
      name: /Reply to this thread/,
    });
    fireEvent.change(box, { target: { value: 'Hi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Sign in again' })).toBeTruthy()
    );
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
