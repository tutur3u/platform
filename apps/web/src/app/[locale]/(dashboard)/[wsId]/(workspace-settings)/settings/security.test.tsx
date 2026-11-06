import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deleteWorkspace: vi.fn(),
  error: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/workspaces', () => ({
  deleteWorkspace: mocks.deleteWorkspace,
}));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: { error: mocks.error } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock('next-intl', () => ({
  useTranslations: () =>
    Object.assign((key: string) => key, { rich: (key: string) => key }),
}));

import Security from './security';

const workspace = {
  id: '00000000-0000-4000-8000-000000000011',
  name: 'Fixture Workspace',
  personal: false,
};

function renderSecurity(ws = workspace) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { mutations: { retry: false } } })
      }
    >
      <Security workspace={ws} />
    </QueryClientProvider>
  );
}
function confirmDeletion() {
  fireEvent.click(screen.getByRole('button', { name: 'delete' }));
  const dialog = screen.getByRole('alertdialog');
  fireEvent.change(within(dialog).getByRole('textbox'), {
    target: { value: workspace.name },
  });
  fireEvent.click(
    within(dialog).getByRole('button', { name: /^delete$|delete workspace/i })
  );
}

describe('Workspace deletion failure UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{}', { status: 500 }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    [
      new InternalApiError('Error deleting workspace', 500),
      'Error deleting workspace',
    ],
    [
      new InternalApiError(
        'Workspace deletion is disabled for this workspace.',
        403
      ),
      'Workspace deletion is disabled for this workspace.',
    ],
    [new TypeError('Failed to fetch'), 'delete_failed_description'],
  ])(
    'surfaces failures through the mounted toast system without navigation',
    async (error, description) => {
      mocks.deleteWorkspace.mockRejectedValue(error);
      renderSecurity();
      confirmDeletion();
      await waitFor(() =>
        expect(mocks.error).toHaveBeenCalledWith('delete_failed', {
          description,
        })
      );
      expect(mocks.push).not.toHaveBeenCalled();
      expect(mocks.refresh).not.toHaveBeenCalled();
      expect(screen.getByRole('alertdialog')).toBeVisible();
      expect(screen.getByRole('textbox')).toHaveValue(workspace.name);
      expect(
        within(screen.getByRole('alertdialog')).getByRole('button', {
          name: 'delete',
        })
      ).toBeEnabled();
      expect(mocks.deleteWorkspace).toHaveBeenCalledTimes(1);
    }
  );

  it('keeps a single request pending, then navigates only after success', async () => {
    let complete: (() => void) | undefined;
    mocks.deleteWorkspace.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        })
    );
    renderSecurity();
    confirmDeletion();
    await waitFor(() =>
      expect(mocks.deleteWorkspace).toHaveBeenCalledWith(workspace.id)
    );
    const action = within(screen.getByRole('alertdialog')).getByRole('button', {
      name: 'deleting...',
    });
    expect(action).toBeDisabled();
    fireEvent.click(action);
    expect(mocks.deleteWorkspace).toHaveBeenCalledTimes(1);
    expect(mocks.push).not.toHaveBeenCalled();
    complete?.();
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/'));
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it.each([
    { ...workspace, personal: true },
    { ...workspace, id: '00000000-0000-0000-0000-000000000000' },
  ])('does not allow deleting personal or root workspaces', (ws) => {
    renderSecurity(ws);
    expect(screen.getByRole('button', { name: 'delete' })).toBeDisabled();
    expect(mocks.deleteWorkspace).not.toHaveBeenCalled();
  });
});
