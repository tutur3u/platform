import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { Workspace } from '@tuturuuu/types';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceIdentityForm } from './workspace-identity-form';

const routerRefresh = vi.fn();
const updateWorkspace = vi.fn();

vi.mock('@tuturuuu/internal-api', () => ({
  updateWorkspace: (...args: unknown[]) => updateWorkspace(...args),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: routerRefresh,
  }),
}));

function renderWithClient(ui: ReactNode, queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('WorkspaceIdentityForm', () => {
  it('optimistically updates workspace caches and clears dirty state after confirmation', async () => {
    const workspace = {
      handle: 'alpha',
      id: 'workspace-alpha',
      name: 'Alpha',
      personal: false,
    } as Workspace;
    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });
    queryClient.setQueryData(['workspace', workspace.id], workspace);
    queryClient.setQueryData(['workspaces'], [workspace]);
    updateWorkspace.mockResolvedValue({ message: 'success' });

    renderWithClient(
      <WorkspaceIdentityForm canEdit workspace={workspace} />,
      queryClient
    );

    const nameInput = screen.getByDisplayValue('Alpha');
    const saveButton = screen.getByRole('button', {
      name: /save_changes/i,
    }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);

    fireEvent.change(nameInput, { target: { value: 'Alpha Studio' } });
    expect(saveButton.disabled).toBe(false);
    fireEvent.click(saveButton);

    await waitFor(() =>
      expect(updateWorkspace).toHaveBeenCalledWith('workspace-alpha', {
        handle: 'alpha',
        name: 'Alpha Studio',
      })
    );
    await waitFor(() => expect(saveButton.disabled).toBe(true));

    expect(
      queryClient.getQueryData<Workspace>(['workspace', workspace.id])?.name
    ).toBe('Alpha Studio');
    expect(
      queryClient.getQueryData<Workspace[]>(['workspaces'])?.[0]?.name
    ).toBe('Alpha Studio');
    expect(routerRefresh).toHaveBeenCalledOnce();
  });
});
