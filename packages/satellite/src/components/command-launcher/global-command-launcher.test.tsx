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
  onNavigate = vi.fn(),
}: Partial<Parameters<typeof GlobalCommandLauncher>[0]> = {}) {
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
      <GlobalCommandLauncher
        currentApp={currentApp}
        currentWorkspaceId={currentWorkspaceId}
        navItems={[
          {
            href: '/personal/tasks',
            keywords: ['Project boards'],
            title: 'Task Boards',
          },
        ]}
        onNavigate={onNavigate}
      />
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

  it('does not render the visible helper footer or current context panel', async () => {
    listWorkspaces.mockResolvedValue(workspaces);
    renderLauncher();

    openGlobalCommandLauncher();
    await screen.findByPlaceholderText('Search apps, workspaces, and pages...');

    const searchHints = screen.getAllByText(
      'Type a workspace, app, page, acronym, or close spelling.'
    );
    expect(searchHints.every((node) => node.closest('.sr-only'))).toBe(true);
    expect(screen.queryByText('navigate')).toBeNull();
    expect(screen.queryByText('select')).toBeNull();
    expect(screen.queryByText('close')).toBeNull();
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
      'h-[min(760px,calc(100dvh-2rem))]'
    );
    expect(dialogContent?.className).toContain(
      'grid-rows-[auto_minmax(0,1fr)]'
    );
    expect(dialogContent?.className).toContain('w-[min(760px,96vw)]');
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
});
