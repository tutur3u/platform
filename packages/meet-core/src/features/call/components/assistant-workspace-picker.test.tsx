// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { WorkspaceVisibilityProvider } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import type { ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { AssistantWorkspacePicker } from './assistant-workspace-picker';

const mocks = vi.hoisted(() => ({ hiddenIds: [] as string[], list: vi.fn() }));
vi.mock('@tuturuuu/internal-api/users', () => ({
  getCurrentUserHiddenWorkspaces: async () => ({
    hiddenWorkspaceIds: mocks.hiddenIds,
  }),
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
      screen.getByRole('option', { name: 'Visible Team' })
    ).toBeInTheDocument()
  );
  expect(
    screen.queryByRole('option', { name: 'Hidden Team' })
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('option', { name: 'assistant_personal_workspace' })
  ).not.toBeInTheDocument();
});
