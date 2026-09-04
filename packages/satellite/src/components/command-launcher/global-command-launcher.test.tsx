import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openGlobalCommandLauncher } from './events';
import { GlobalCommandLauncher } from './global-command-launcher';

const listWorkspaces = vi.fn();
const pathname = vi.fn(() => '/personal');

class ResizeObserverMock {
  disconnect() {}
  observe() {}
  unobserve() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock);
Element.prototype.scrollIntoView = vi.fn();

vi.mock('@tuturuuu/internal-api', () => ({
  listWorkspaces: (...args: unknown[]) => listWorkspaces(...args),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => pathname(),
}));

const workspaces = [
  {
    access_type: 'owner',
    created_by_me: true,
    guest_landing_path: null,
    id: 'personal-id',
    name: 'Personal Space',
    personal: true,
  },
  {
    access_type: 'owner',
    created_by_me: true,
    guest_landing_path: null,
    id: 'alpha-workspace',
    name: 'Alpha Workspace',
    personal: false,
  },
  {
    access_type: 'guest',
    created_by_me: false,
    guest_landing_path: '/guest-board',
    id: 'guest-workspace',
    name: 'Guest Operations',
    personal: false,
  },
];

function renderLauncher({
  currentApp = 'calendar',
  currentWorkspaceId = 'personal-id',
  defaultTab = 'all',
  duplicateCount = 1,
  enableTasks = false,
  navItems = [
    {
      href: '/personal/tasks',
      keywords: ['Project boards'],
      title: 'Task Boards',
    },
  ],
  onNavigate,
}: Partial<Parameters<typeof GlobalCommandLauncher>[0]> & {
  duplicateCount?: number;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <input aria-label="Editor" />
      {Array.from({ length: duplicateCount }, (_, index) => (
        <GlobalCommandLauncher
          currentApp={currentApp}
          currentWorkspaceId={currentWorkspaceId}
          defaultTab={defaultTab}
          enableTasks={enableTasks}
          key={index}
          navItems={navItems}
          onNavigate={onNavigate}
        />
      ))}
    </QueryClientProvider>
  );

  return { onNavigate };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('GlobalCommandLauncher', () => {
  it('opens from an input with Ctrl+K and marks current app and workspace', async () => {
    listWorkspaces.mockResolvedValue(workspaces);
    renderLauncher();

    screen.getByLabelText('Editor').focus();
    fireEvent.keyDown(document, { ctrlKey: true, key: 'k' });

    expect(
      await screen.findByPlaceholderText(
        'Search apps, workspaces, and pages...'
      )
    ).toBeTruthy();
    expect(screen.getAllByText('Calendar').length).toBeGreaterThan(0);
    expect(await screen.findByText('Personal')).toBeTruthy();
    await waitFor(() =>
      expect(screen.getAllByText('Current').length).toBeGreaterThanOrEqual(2)
    );
  }, 10_000);

  it('opens from an unlisted external host app without cataloging it', async () => {
    listWorkspaces.mockResolvedValue(workspaces);
    renderLauncher({ currentApp: 'external' });

    openGlobalCommandLauncher();
    await screen.findByPlaceholderText('Search apps, workspaces, and pages...');

    expect(screen.queryByText('External')).toBeNull();
    expect(screen.getAllByText('Calendar').length).toBeGreaterThan(0);
    expect(await screen.findByText('Personal')).toBeTruthy();
  });

  it('opens only one same-app launcher from duplicate Ctrl+K listeners', async () => {
    listWorkspaces.mockResolvedValue(workspaces);
    renderLauncher({ duplicateCount: 2 });

    fireEvent.keyDown(document, { ctrlKey: true, key: 'k' });

    await waitFor(() => {
      expect(
        screen.getAllByPlaceholderText('Search apps, workspaces, and pages...')
      ).toHaveLength(1);
    });
  });

  it('gives a product-native launcher priority over the generic host launcher', async () => {
    listWorkspaces.mockResolvedValue(workspaces);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <GlobalCommandLauncher
          currentApp="tasks"
          labels={{ placeholder: 'Generic search' }}
        />
        <GlobalCommandLauncher
          currentApp="tasks"
          instancePriority={10}
          labels={{ placeholder: 'Task-first search' }}
        />
      </QueryClientProvider>
    );

    fireEvent.keyDown(document, { ctrlKey: true, key: 'k' });

    expect(
      await screen.findByPlaceholderText('Task-first search')
    ).toBeTruthy();
    expect(screen.queryByPlaceholderText('Generic search')).toBeNull();
  });

  it('ignores Cmd/Ctrl+K while an input method is composing', () => {
    listWorkspaces.mockResolvedValue(workspaces);
    renderLauncher();

    fireEvent.keyDown(document, {
      ctrlKey: true,
      isComposing: true,
      key: 'k',
    });

    expect(
      screen.queryByPlaceholderText('Search apps, workspaces, and pages...')
    ).toBeNull();
  });

  it('opens only one same-app launcher from the global open event', async () => {
    listWorkspaces.mockResolvedValue(workspaces);
    renderLauncher({ duplicateCount: 2 });

    openGlobalCommandLauncher();

    await waitFor(() => {
      expect(
        screen.getAllByPlaceholderText('Search apps, workspaces, and pages...')
      ).toHaveLength(1);
    });
  });

  it('renders compact keyboard guidance without a redundant context panel', async () => {
    listWorkspaces.mockResolvedValue(workspaces);
    renderLauncher();

    openGlobalCommandLauncher();
    await screen.findByPlaceholderText('Search apps, workspaces, and pages...');

    expect(screen.getByText('navigate')).toBeTruthy();
    expect(screen.getByText('select')).toBeTruthy();
    expect(screen.getByText('close')).toBeTruthy();
    expect(
      screen.getAllByText(
        'Type a workspace, app, page, acronym, or close spelling.'
      ).length
    ).toBeGreaterThan(0);
    expect(screen.queryByText('Current app')).toBeNull();
    expect(screen.queryByText('Current workspace')).toBeNull();
  });

  it('filters apps, workspaces, and navigation with the shared matcher', async () => {
    listWorkspaces.mockResolvedValue(workspaces);
    renderLauncher();

    openGlobalCommandLauncher();
    const input = await screen.findByPlaceholderText(
      'Search apps, workspaces, and pages...'
    );

    fireEvent.change(input, { target: { value: 'fin' } });
    expect(await screen.findByText('Finance')).toBeTruthy();

    fireEvent.change(input, { target: { value: 'alhpa workspace' } });
    expect(await screen.findByText('Alpha Workspace')).toBeTruthy();

    fireEvent.change(input, { target: { value: 'project boards' } });
    expect(await screen.findByText('Task Boards')).toBeTruthy();
  });

  it('switches result categories with tabs, prefixes, and keyboard shortcuts', async () => {
    listWorkspaces.mockResolvedValue(workspaces);
    renderLauncher({ enableTasks: true });

    openGlobalCommandLauncher();
    const input = await screen.findByPlaceholderText(
      'Search apps, workspaces, and pages...'
    );

    fireEvent.click(screen.getByRole('button', { name: /Navigation/ }));
    expect(screen.queryByText('Calendar')).toBeNull();
    expect(screen.getByText('Task Boards')).toBeTruthy();

    fireEvent.change(input, { target: { value: '@finance' } });
    expect(await screen.findByText('Finance')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /Apps/ }).getAttribute('aria-pressed')
    ).toBe('true');

    fireEvent.keyDown(input, { ctrlKey: true, key: '3' });
    expect(
      screen
        .getByRole('button', { name: /Navigation/ })
        .getAttribute('aria-pressed')
    ).toBe('true');
  });

  it('keeps capability-free satellite search unified without empty tabs', async () => {
    listWorkspaces.mockResolvedValue(workspaces);
    renderLauncher();

    openGlobalCommandLauncher();
    await screen.findByPlaceholderText('Search apps, workspaces, and pages...');

    expect(screen.queryByRole('button', { name: /Tasks/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Actions/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /All/ })).toBeNull();
  });

  it('exposes task-first navigation only when the host enables tasks', async () => {
    listWorkspaces.mockResolvedValue(workspaces);
    renderLauncher({ defaultTab: 'tasks', enableTasks: true });

    openGlobalCommandLauncher();
    await screen.findByPlaceholderText('Search apps, workspaces, and pages...');

    expect(
      screen.getByRole('button', { name: /Tasks/ }).getAttribute('aria-pressed')
    ).toBe('true');
    expect(screen.getByRole('button', { name: /All/ })).toBeTruthy();
  });

  it('hides the navigation tab when a task-enabled host has no pages', async () => {
    listWorkspaces.mockResolvedValue(workspaces);
    renderLauncher({ defaultTab: 'tasks', enableTasks: true, navItems: [] });

    openGlobalCommandLauncher();
    const input = await screen.findByPlaceholderText(
      'Search apps, workspaces, and pages...'
    );

    expect(screen.queryByRole('button', { name: /Navigation/ })).toBeNull();

    fireEvent.keyDown(input, { ctrlKey: true, key: '3' });
    expect(
      screen.getByRole('button', { name: /Apps/ }).getAttribute('aria-pressed')
    ).toBe('true');
  });

  it('does not search remote workspaces from a task-only category', async () => {
    listWorkspaces.mockResolvedValue(workspaces);
    renderLauncher({ defaultTab: 'tasks', enableTasks: true, navItems: [] });

    openGlobalCommandLauncher();
    const input = await screen.findByPlaceholderText(
      'Search apps, workspaces, and pages...'
    );

    await waitFor(() => expect(listWorkspaces).toHaveBeenCalledTimes(1));
    fireEvent.change(input, { target: { value: 'launch' } });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(listWorkspaces).toHaveBeenCalledTimes(1);
  });

  it('queries workspace search results beyond the initially loaded workspaces', async () => {
    const remoteWorkspace = {
      access_type: 'owner',
      created_by_me: false,
      guest_landing_path: null,
      id: 'zeta-workspace',
      name: 'Zeta Workspace',
      personal: false,
    };
    listWorkspaces.mockImplementation((params?: { q?: string }) =>
      Promise.resolve(params?.q ? [remoteWorkspace] : workspaces.slice(0, 1))
    );
    renderLauncher();

    openGlobalCommandLauncher();
    const input = await screen.findByPlaceholderText(
      'Search apps, workspaces, and pages...'
    );

    fireEvent.change(input, { target: { value: 'zeta' } });

    expect(await screen.findByText('Zeta Workspace')).toBeTruthy();
    await waitFor(() =>
      expect(listWorkspaces).toHaveBeenCalledWith({
        limit: 50,
        q: 'zeta',
      })
    );
  });

  it('shows empty state', async () => {
    listWorkspaces.mockResolvedValue([]);
    renderLauncher();

    openGlobalCommandLauncher();
    const input = await screen.findByPlaceholderText(
      'Search apps, workspaces, and pages...'
    );

    fireEvent.change(input, { target: { value: 'zzzzzzzz' } });

    expect(
      (await screen.findAllByText('No command found')).length
    ).toBeGreaterThan(0);
  });

  it('shows loading and error states', async () => {
    let rejectWorkspaces: (error: Error) => void = () => {};
    listWorkspaces.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectWorkspaces = reject;
      })
    );
    renderLauncher();

    openGlobalCommandLauncher();
    expect(await screen.findByText('Loading workspaces')).toBeTruthy();

    rejectWorkspaces(new Error('Failed'));
    await waitFor(() =>
      expect(screen.getByText('Could not load workspaces')).toBeTruthy()
    );
  });

  it('keeps long result sets inside the dialog scroll region', async () => {
    listWorkspaces.mockResolvedValue(workspaces);
    renderLauncher();

    openGlobalCommandLauncher();
    await screen.findByPlaceholderText('Search apps, workspaces, and pages...');

    const dialogContent = document.querySelector(
      '[data-slot="dialog-content"]'
    );
    const commandList = document.querySelector('[data-slot="command-list"]');

    expect(dialogContent?.className).toContain(
      'h-[min(680px,calc(100dvh-1.5rem))]'
    );
    expect(dialogContent?.className).toContain('grid-rows-[minmax(0,1fr)]');
    expect(dialogContent?.className).toContain(
      'w-[min(760px,calc(100vw-1.5rem))]'
    );
    expect(dialogContent?.className).toContain('overflow-hidden');
    expect(commandList?.className).toContain('min-h-0');
    expect(commandList?.className).toContain('flex-1');
    expect(commandList?.className).toContain('overflow-y-auto');
  });

  it('navigates through the resolved app URL when a result is selected', async () => {
    listWorkspaces.mockResolvedValue(workspaces);
    const onNavigate = vi.fn();
    renderLauncher({ onNavigate });

    openGlobalCommandLauncher();
    const input = await screen.findByPlaceholderText(
      'Search apps, workspaces, and pages...'
    );
    fireEvent.change(input, { target: { value: 'finance' } });
    fireEvent.click(await screen.findByText('Finance'));

    expect(onNavigate).toHaveBeenCalledWith(
      'http://localhost:7808/personal?source=command-launcher'
    );
  });

  it('opens Pay app command results in a new tab by default', async () => {
    listWorkspaces.mockResolvedValue(workspaces);
    const open = vi.fn();
    vi.stubGlobal('open', open);
    renderLauncher();

    openGlobalCommandLauncher();
    const input = await screen.findByPlaceholderText(
      'Search apps, workspaces, and pages...'
    );
    fireEvent.change(input, { target: { value: 'pay' } });
    fireEvent.click(await screen.findByText('Pay'));

    expect(open).toHaveBeenCalledWith(
      'http://localhost:7826/personal?source=command-launcher',
      '_blank',
      'noopener,noreferrer'
    );
  });
});
