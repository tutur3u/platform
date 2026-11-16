import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { WorkspaceVisibilityProvider } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import { LAUNCHABLE_APPS } from '@tuturuuu/utils/launchable-apps';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveRecents } from './command-center-recent-section';
import {
  readCommandCenterRecents,
  recordCommandCenterRecent,
} from './command-center-recents';
import {
  buildCommandLauncherLabels,
  buildCommandLauncherLabelsFromMessages,
  COMMAND_LAUNCHER_MESSAGE_KEYS,
} from './command-launcher-labels';
import { openGlobalCommandLauncher } from './events';
import { GlobalCommandLauncher } from './global-command-launcher';
import { findMatchRanges, HighlightMatch } from './highlight-match';

const listWorkspaces = vi.fn();
vi.mock('@tuturuuu/internal-api/users', () => ({
  getCurrentUserHiddenWorkspaces: () =>
    Promise.resolve({ hiddenWorkspaceIds: ['hidden-ws'] }),
  updateCurrentUserHiddenWorkspace: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  listWorkspaces: (...args: unknown[]) => listWorkspaces(...args),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/personal' }));

class ResizeObserverMock {
  disconnect() {}
  observe() {}
  unobserve() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverMock);
Element.prototype.scrollIntoView = vi.fn();

const PLACEHOLDER = 'Search apps, workspaces, and pages...';
const workspaces = [
  {
    access_type: 'owner',
    created_by_me: true,
    guest_landing_path: null,
    id: 'alpha',
    name: 'Alpha Workspace',
    personal: false,
  },
  {
    access_type: 'owner',
    created_by_me: true,
    guest_landing_path: null,
    id: 'hidden-ws',
    name: 'Hidden Workspace',
    personal: false,
  },
];

function wrap(children: ReactNode, actorId?: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      {actorId ? (
        <WorkspaceVisibilityProvider actorId={actorId}>
          {children}
        </WorkspaceVisibilityProvider>
      ) : (
        children
      )}
    </QueryClientProvider>
  );
}

async function openWith(query = '') {
  act(() => openGlobalCommandLauncher());
  const input = (await screen.findByPlaceholderText(
    PLACEHOLDER
  )) as HTMLInputElement;
  if (query) fireEvent.change(input, { target: { value: query } });
  return input;
}

beforeEach(() => {
  window.localStorage.clear();
  listWorkspaces.mockResolvedValue(workspaces);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('highlighted match text', () => {
  it('finds whole-query and per-word ranges case-insensitively', () => {
    expect(findMatchRanges('Finance', 'fin')).toEqual([{ end: 3, start: 0 }]);
    expect(findMatchRanges('Task Boards', 'boa tas')).toEqual([
      { end: 4, start: 0 },
      { end: 8, start: 5 },
    ]);
    expect(findMatchRanges('Finance', '')).toEqual([]);
  });

  it('renders markup in titles as text, never as elements', () => {
    const { container } = render(
      <HighlightMatch query="img" text={'<img src=x onerror="alert(1)">'} />
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('mark')?.textContent).toBe('img');
    expect(container.textContent).toBe('<img src=x onerror="alert(1)">');
  });
});

describe('recent store', () => {
  it('keeps the newest entry first, per actor, without duplicates', () => {
    recordCommandCenterRecent('a', { id: 'finance', kind: 'app' }, 1);
    recordCommandCenterRecent('a', { id: 'tasks', kind: 'app' }, 2);
    recordCommandCenterRecent('a', { id: 'finance', kind: 'app' }, 3);
    expect(readCommandCenterRecents('a', 4).map((entry) => entry.id)).toEqual(
      ['finance', 'tasks']
    );
    expect(readCommandCenterRecents('b', 4)).toEqual([]);
  });

  it('ignores corrupt storage', () => {
    window.localStorage.setItem(
      'tuturuuu:command-center:recent:a',
      '{not json'
    );
    expect(readCommandCenterRecents('a')).toEqual([]);
  });

  it('resolves only entries the host can show now', () => {
    const resolved = resolveRecents(
      [
        { at: 1, id: 'finance', kind: 'app' },
        { at: 1, id: '/gone', kind: 'navigation' },
        { at: 1, id: 'hidden-ws', kind: 'workspace' },
        { at: 1, id: 'alpha', kind: 'workspace' },
      ],
      {
        apps: LAUNCHABLE_APPS,
        navItems: [],
        workspaces: [workspaces[0] as never],
      }
    );
    expect(resolved.map((entry) => entry.value)).toEqual([
      'recent-app-finance',
      'recent-workspace-alpha',
    ]);
  });
});

describe('localized labels', () => {
  it('reads every label from the command_launcher namespace', () => {
    const keys: string[] = [];
    buildCommandLauncherLabels({
      launcher: (key: string) => {
        keys.push(key);
        return `vi:${key}`;
      },
    });
    expect(keys.sort()).toEqual(
      Object.values(COMMAND_LAUNCHER_MESSAGE_KEYS).sort()
    );
  });

  it('builds labels from a raw messages object, nested keys included', () => {
    expect(
      buildCommandLauncherLabelsFromMessages({
        recent: 'Gần đây',
        scopes: { all: 'Tất cả' },
      })
    ).toEqual({ all: 'Tất cả', recent: 'Gần đây' });
  });
});

describe('Recent section and follow-ups in the center', () => {
  it('shows a recently opened app and hides Hidden workspaces from Recent', async () => {
    recordCommandCenterRecent('actor', { id: 'hidden-ws', kind: 'workspace' });
    recordCommandCenterRecent('actor', { id: 'finance', kind: 'app' });
    wrap(<GlobalCommandLauncher currentApp="calendar" />, 'actor');
    await openWith();

    await waitFor(() => expect(screen.getByText('Recent')).toBeTruthy());
    expect(
      document.querySelector('[cmdk-item][data-value="recent-app-finance"]')
    ).not.toBeNull();
    expect(
      document.querySelector('[data-value="recent-workspace-hidden-ws"]')
    ).toBeNull();
  });

  it('records the opened result for the next session', async () => {
    const onNavigate = vi.fn();
    wrap(
      <GlobalCommandLauncher currentApp="calendar" onNavigate={onNavigate} />,
      'actor'
    );
    await openWith('finance');
    fireEvent.click(await screen.findByText('Finance'));
    expect(readCommandCenterRecents('actor')[0]).toMatchObject({
      id: 'finance',
      kind: 'app',
    });
  });

  it('offers Create task and Ask Mira to a signed-in actor and opens their apps', async () => {
    const onNavigate = vi.fn();
    wrap(
      <GlobalCommandLauncher currentApp="calendar" onNavigate={onNavigate} />,
      'actor'
    );
    await openWith('qqqqzz');

    expect(await screen.findByText('Create task')).toBeTruthy();
    expect(document.querySelector('[data-command-empty-note]')).not.toBeNull();
    fireEvent.click(screen.getByText('Ask Mira'));
    const miraUrl = new URL(onNavigate.mock.calls[0]?.[0]);
    expect(miraUrl.pathname.endsWith('/personal')).toBe(true);
    expect(miraUrl.searchParams.get('prompt')).toBe('qqqqzz');
    expect(miraUrl.searchParams.get('source')).toBe('command-launcher');
  });

  it('carries the typed query into the Tasks composer title', async () => {
    const onNavigate = vi.fn();
    wrap(
      <GlobalCommandLauncher currentApp="calendar" onNavigate={onNavigate} />,
      'actor'
    );
    await openWith('Plan & ship <launch>');
    fireEvent.click(await screen.findByText('Create task'));
    const tasksUrl = new URL(onNavigate.mock.calls[0]?.[0]);
    expect(tasksUrl.pathname.endsWith('/personal/tasks/new')).toBe(true);
    expect(tasksUrl.searchParams.getAll('title')).toEqual([
      'Plan & ship <launch>',
    ]);
    expect(screen.queryByText('Create task')).toBeNull();
  });

  it('lets a host turn off a follow-up its own sections provide', async () => {
    wrap(
      <GlobalCommandLauncher
        currentApp="tasks"
        fallbackActions={{ createTask: false }}
      />,
      'actor'
    );
    await openWith('qqqqzz');
    expect(await screen.findByText('Ask Mira')).toBeTruthy();
    expect(screen.queryByText('Create task')).toBeNull();
  });

  it('offers no follow-ups and sends no requests without a known actor', async () => {
    wrap(<GlobalCommandLauncher currentApp="shortener" />);
    await openWith('qqqqzz');
    expect(screen.queryByText('Create task')).toBeNull();
    expect(screen.queryByText('Ask Mira')).toBeNull();
    expect(listWorkspaces).not.toHaveBeenCalled();
  });

  it('runs without a host query client and stays idle', async () => {
    render(<GlobalCommandLauncher currentApp="shortener" />);
    await openWith('fin');
    expect(await screen.findByText('Finance')).toBeTruthy();
    expect(listWorkspaces).not.toHaveBeenCalled();
  });

  it('highlights the matched part of a result title', async () => {
    wrap(<GlobalCommandLauncher currentApp="calendar" />);
    await openWith('finan');
    await screen.findByText('Finance', { exact: false });
    const marks = [...document.querySelectorAll('mark')].map(
      (mark) => mark.textContent
    );
    expect(marks).toContain('Finan');
  });
});
