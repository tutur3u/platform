// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { WorkspaceVisibilityProvider } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import type { ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  AssistantWorkspacePicker,
  useAssistantWorkspaceSelection,
} from './assistant-workspace-picker';

const mocks = vi.hoisted(() => ({
  hiddenIds: [] as string[],
  list: vi.fn(),
  hidden: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/users', () => ({
  getCurrentUserHiddenWorkspaces: mocks.hidden,
  updateCurrentUserHiddenWorkspace: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/workspaces', () => ({
  listWorkspaces: mocks.list,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@tuturuuu/ui/select', () => ({
  Select: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: ReactNode }) => (
    <div role="listbox">{children}</div>
  ),
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <div role="option" tabIndex={0} aria-selected={false} data-value={value}>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: () => null,
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.hiddenIds = [];
  mocks.hidden.mockImplementation(async () => ({
    hiddenWorkspaceIds: mocks.hiddenIds,
  }));
  mocks.list.mockResolvedValue([
    {
      id: 'personal-id',
      name: 'Personal',
      personal: true,
      access_type: 'member',
    },
    {
      id: 'team-visible',
      name: 'Visible Team',
      personal: false,
      access_type: 'member',
    },
    {
      id: 'team-hidden',
      name: 'Hidden Team',
      personal: false,
      access_type: 'member',
    },
  ]);
});
it('assistant options exclude Hidden personal and team workspaces', async () => {
  mocks.hiddenIds = ['personal-id', 'team-hidden'];
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <WorkspaceVisibilityProvider actorId="synthetic-actor">
        <AssistantWorkspacePicker
          selfUserId="synthetic-actor"
          value="personal"
          onChange={vi.fn()}
        />
      </WorkspaceVisibilityProvider>
    </QueryClientProvider>
  );
  await waitFor(() =>
    expect(
      screen.getByRole('option', { name: 'Visible Team' }).isConnected
    ).toBe(true)
  );
  expect(screen.queryByRole('option', { name: 'Hidden Team' })).toBeNull();
  expect(
    screen.queryByRole('option', { name: 'assistant_personal_workspace' })
  ).toBeNull();
});

function selectionFixture() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <WorkspaceVisibilityProvider actorId="synthetic-actor">
        {children}
      </WorkspaceVisibilityProvider>
    </QueryClientProvider>
  );
  return { client, wrapper };
}
it('invalidates a selected personal destination immediately when hidden', async () => {
  const { client, wrapper } = selectionFixture();
  const { result } = renderHook(
    () => useAssistantWorkspaceSelection('personal', 'synthetic-actor'),
    { wrapper }
  );
  await waitFor(() => expect(result.current.allowed).toBe(true));
  act(() =>
    client.setQueryData(
      ['workspace-hidden', 'synthetic-actor'],
      ['personal-id']
    )
  );
  await waitFor(() => expect(result.current.allowed).toBe(false));
  expect(result.current.value).toBe('personal');
});
it('does not permit a guest, missing or foreign-actor destination', async () => {
  mocks.list.mockResolvedValue([
    { id: 'guest', access_type: 'guest', personal: false },
  ]);
  const { wrapper } = selectionFixture();
  const { result, rerender } = renderHook(
    ({ value, user }) => useAssistantWorkspaceSelection(value, user),
    { wrapper, initialProps: { value: 'guest', user: 'synthetic-actor' } }
  );
  await waitFor(() => expect(result.current.workspaces.data).toHaveLength(1));
  expect(result.current.allowed).toBe(false);
  rerender({ value: 'personal', user: 'synthetic-actor' });
  expect(result.current.allowed).toBe(false);
  rerender({ value: 'guest', user: 'other-actor' });
  expect(result.current.allowed).toBe(false);
});
it('blocks selected assistant destinations after a settled private-read failure', async () => {
  mocks.hidden.mockRejectedValue(new Error('offline'));
  const { client, wrapper } = selectionFixture();
  const { result } = renderHook(
    () => useAssistantWorkspaceSelection('personal', 'synthetic-actor'),
    { wrapper }
  );
  await waitFor(() =>
    expect(
      client.getQueryState(['workspace-hidden', 'synthetic-actor'])?.status
    ).toBe('error')
  );
  expect(result.current.allowed).toBe(false);
});
