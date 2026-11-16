import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { WorkspaceVisibilityProvider } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommandLauncherExtraSectionContext } from './command-launcher-types';
import { openGlobalCommandLauncher } from './events';
import { GlobalCommandLauncher } from './global-command-launcher';

const listWorkspaces = vi.fn();
vi.mock('@tuturuuu/internal-api/users', () => ({
  getCurrentUserHiddenWorkspaces: () =>
    Promise.resolve({ hiddenWorkspaceIds: [] }),
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

function wrap(children: ReactNode, { actorId }: { actorId?: string } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const content = (
    <>
      <button type="button">Opener</button>
      {children}
    </>
  );
  return render(
    <QueryClientProvider client={client}>
      {actorId ? (
        <WorkspaceVisibilityProvider actorId={actorId}>
          {content}
        </WorkspaceVisibilityProvider>
      ) : (
        content
      )}
    </QueryClientProvider>
  );
}

const navItems = [
  { href: '/personal/tasks', keywords: ['Project boards'], title: 'Boards' },
];

async function openAndFindInput(
  options?: Parameters<typeof openGlobalCommandLauncher>[0]
) {
  act(() => openGlobalCommandLauncher(options));
  return (await screen.findByPlaceholderText(PLACEHOLDER)) as HTMLInputElement;
}

function pressed(name: RegExp) {
  return screen.getByRole('button', { name }).getAttribute('aria-pressed');
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

describe('command center document singleton', () => {
  it('attaches one shortcut listener for any number of mounted launchers', () => {
    listWorkspaces.mockResolvedValue([]);
    const addListener = vi.spyOn(document, 'addEventListener');
    wrap(
      <>
        <GlobalCommandLauncher currentApp="calendar" />
        <GlobalCommandLauncher currentApp="calendar" />
        <GlobalCommandLauncher currentApp="tasks" instancePriority={10} />
      </>
    );
    const keydownListeners = addListener.mock.calls.filter(
      ([type]) => type === 'keydown'
    );
    expect(keydownListeners).toHaveLength(1);
    addListener.mockRestore();
  });

  it('elects the highest priority regardless of mount order', async () => {
    listWorkspaces.mockResolvedValue([]);
    wrap(
      <>
        <GlobalCommandLauncher
          currentApp="finance"
          instancePriority={10}
          labels={{ placeholder: 'Product search' }}
        />
        <GlobalCommandLauncher
          currentApp="finance"
          labels={{ placeholder: 'Shell search' }}
        />
      </>
    );
    fireEvent.keyDown(document, { ctrlKey: true, key: 'k' });
    expect(await screen.findByPlaceholderText('Product search')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Shell search')).toBeNull();
    expect(document.querySelectorAll('[data-slot="dialog-content"]')).toHaveLength(
      1
    );
  });

  it('renders no dialog before the first open intent', () => {
    listWorkspaces.mockResolvedValue([]);
    wrap(<GlobalCommandLauncher currentApp="calendar" />);
    expect(document.querySelector('[data-slot="dialog-content"]')).toBeNull();
    expect(listWorkspaces).not.toHaveBeenCalled();
  });
});

describe('command center keyboard grammar', () => {
  it('opens with a requested scope, query and mode', async () => {
    listWorkspaces.mockResolvedValue([]);
    const sections = vi.fn((_context: CommandLauncherExtraSectionContext) => (
      <div>Host section</div>
    ));
    wrap(
      <GlobalCommandLauncher
        currentApp="finance"
        extraSections={sections}
        navItems={navItems}
      />
    );
    const input = await openAndFindInput({
      mode: 'quick-create',
      query: 'new',
      scope: 'actions',
    });
    expect(input.value).toBe('new');
    expect(pressed(/Actions/)).toBe('true');
    expect(sections).toHaveBeenLastCalledWith(
      expect.objectContaining({ activeTab: 'actions', mode: 'quick-create' })
    );
  });

  it('cycles scopes with Tab and Shift+Tab and leaves a scope on Backspace', async () => {
    listWorkspaces.mockResolvedValue([]);
    wrap(
      <GlobalCommandLauncher
        currentApp="calendar"
        extraSections={() => null}
        navItems={navItems}
      />
    );
    const input = await openAndFindInput();
    expect(pressed(/All/)).toBe('true');

    fireEvent.keyDown(input, { key: 'Tab' });
    expect(pressed(/Navigation/)).toBe('true');
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(pressed(/Apps/)).toBe('true');
    fireEvent.keyDown(input, { key: 'Tab', shiftKey: true });
    expect(pressed(/Navigation/)).toBe('true');

    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(pressed(/All/)).toBe('true');
  });

  it('unwinds Esc: query first, then the dialog, restoring focus', async () => {
    listWorkspaces.mockResolvedValue([]);
    wrap(<GlobalCommandLauncher currentApp="calendar" />);
    const opener = screen.getByRole('button', { name: 'Opener' });
    opener.focus();
    fireEvent.keyDown(opener, { ctrlKey: true, key: 'k' });
    const input = (await screen.findByPlaceholderText(
      PLACEHOLDER
    )) as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'cal' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('');
    expect(screen.getByPlaceholderText(PLACEHOLDER)).toBeTruthy();

    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByPlaceholderText(PLACEHOLDER)).toBeNull()
    );
    expect(document.activeElement).toBe(opener);
  });

  it('opens item actions with ArrowRight and runs them with Enter', async () => {
    listWorkspaces.mockResolvedValue([]);
    const open = vi.fn();
    vi.stubGlobal('open', open);
    wrap(<GlobalCommandLauncher currentApp="calendar" />);
    const input = await openAndFindInput();
    fireEvent.change(input, { target: { value: 'finance' } });
    await screen.findByText('Finance');

    fireEvent.keyDown(input, { key: 'ArrowRight' });
    const panel = await screen.findByRole('complementary', {
      name: 'Finance',
    });
    expect(panel.textContent).toContain('Open in new tab');
    expect(panel.textContent).toContain('Copy link');

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(open).toHaveBeenCalledWith(
      'http://localhost:7808/personal?source=command-launcher',
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('closes item actions with ArrowLeft and Esc without closing the dialog', async () => {
    listWorkspaces.mockResolvedValue([]);
    wrap(<GlobalCommandLauncher currentApp="calendar" />);
    const input = await openAndFindInput();
    fireEvent.change(input, { target: { value: 'finance' } });
    await screen.findByText('Finance');

    fireEvent.keyDown(input, { key: 'ArrowRight' });
    await screen.findByRole('complementary', { name: 'Finance' });
    fireEvent.keyDown(input, { key: 'ArrowLeft' });
    expect(screen.queryByRole('complementary', { name: 'Finance' })).toBeNull();

    fireEvent.keyDown(input, { key: 'ArrowRight' });
    await screen.findByRole('complementary', { name: 'Finance' });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('complementary', { name: 'Finance' })).toBeNull();
    expect(screen.getByPlaceholderText(PLACEHOLDER)).toBeTruthy();
  });

  it('opens the highlighted result in a new tab with Ctrl/Cmd+Enter', async () => {
    listWorkspaces.mockResolvedValue([]);
    const open = vi.fn();
    const onNavigate = vi.fn();
    vi.stubGlobal('open', open);
    wrap(<GlobalCommandLauncher currentApp="calendar" onNavigate={onNavigate} />);
    const input = await openAndFindInput();
    fireEvent.change(input, { target: { value: 'finance' } });
    await screen.findByText('Finance');

    fireEvent.keyDown(input, { key: 'Enter', metaKey: true });
    expect(open).toHaveBeenCalledWith(
      'http://localhost:7808/personal?source=command-launcher',
      '_blank',
      'noopener,noreferrer'
    );
    expect(onNavigate).not.toHaveBeenCalled();
  });
});

describe('command center remote states', () => {
  it('keeps local apps visible while workspaces fail, then retries', async () => {
    listWorkspaces
      .mockRejectedValueOnce(new Error('Failed'))
      .mockResolvedValue([
        {
          access_type: 'owner',
          created_by_me: true,
          guest_landing_path: null,
          id: 'alpha',
          name: 'Alpha Workspace',
          personal: false,
        },
      ]);
    wrap(<GlobalCommandLauncher currentApp="calendar" />, {
      actorId: 'synthetic-actor',
    });
    await openAndFindInput();

    expect(await screen.findByText('Could not load workspaces')).toBeTruthy();
    expect(screen.getAllByText('Calendar').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
    expect(await screen.findByText('Alpha Workspace')).toBeTruthy();
  });

  it('reports offline in the footer status', async () => {
    listWorkspaces.mockResolvedValue([]);
    wrap(<GlobalCommandLauncher currentApp="calendar" />);
    await openAndFindInput();

    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => false,
    });
    try {
      act(() => {
        window.dispatchEvent(new Event('offline'));
      });
      const statuses = await screen.findAllByRole('status');
      expect(statuses.some((node) => node.textContent?.includes('Offline'))).toBe(
        true
      );
    } finally {
      Reflect.deleteProperty(navigator, 'onLine');
    }
  });
});
