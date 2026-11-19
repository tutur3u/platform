// @vitest-environment jsdom
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
  getWorkspaceDeletionStatus: vi.fn(),
  error: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api/workspaces', () => ({
  deleteWorkspace: mocks.deleteWorkspace,
  getWorkspaceDeletionStatus: mocks.getWorkspaceDeletionStatus,
}));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: { error: mocks.error } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock('next-intl', () => ({
  useTranslations: () =>
    Object.assign((key: string) => key, { rich: (key: string) => key }),
}));

import { WorkspaceDeletionSettings } from '@tuturuuu/ui/custom/workspace-deletion-settings';

const workspace = {
  id: '00000000-0000-4000-8000-000000000011',
  name: 'Fixture Workspace',
  creator_id: 'owner',
  personal: false,
};

function renderSecurity(ws = workspace, actorId = workspace.creator_id) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { mutations: { retry: false } } })
      }
    >
      <WorkspaceDeletionSettings workspace={ws} actorId={actorId} />
    </QueryClientProvider>
  );
}
async function confirmDeletion() {
  const trigger = screen.getByRole('button', { name: 'delete' });
  await waitFor(() => expect(trigger).toBeEnabled());
  fireEvent.click(trigger);
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
    mocks.getWorkspaceDeletionStatus.mockResolvedValue({ status: 'ready' });
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
      new InternalApiError(
        'Cancel the workspace subscription before deleting it.',
        409,
        'subscription_active'
      ),
      'delete_subscription_active',
    ],
    [
      new InternalApiError(
        'Type the workspace name to confirm.',
        400,
        'confirmation_mismatch'
      ),
      'delete_confirmation_mismatch',
    ],
    [
      new InternalApiError(
        'This workspace cannot be deleted.',
        403,
        'forbidden'
      ),
      'delete_failed_description',
    ],
    [
      new InternalApiError('Error deleting workspace', 500),
      'delete_failed_description',
    ],
    [new TypeError('Failed to fetch'), 'delete_failed_description'],
  ])(
    'surfaces failures through the mounted toast system without navigation',
    async (error, description) => {
      mocks.deleteWorkspace.mockRejectedValue(error);
      renderSecurity();
      await confirmDeletion();
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
    await confirmDeletion();
    await waitFor(() =>
      expect(mocks.deleteWorkspace).toHaveBeenCalledWith(
        workspace.id,
        workspace.name
      )
    );
    const action = within(screen.getByRole('alertdialog')).getByRole('button', {
      name: 'deleting',
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
    expect(screen.queryByRole('button', { name: 'delete' })).toBeNull();
    expect(mocks.getWorkspaceDeletionStatus).not.toHaveBeenCalled();
    expect(mocks.deleteWorkspace).not.toHaveBeenCalled();
  });

  it('does not offer deletion to a non-owner', () => {
    renderSecurity(workspace, 'settings-manager');
    expect(screen.queryByText('danger_zone')).toBeNull();
    expect(mocks.getWorkspaceDeletionStatus).not.toHaveBeenCalled();
  });

  it('displays an active-subscription warning and disables deletion', async () => {
    mocks.getWorkspaceDeletionStatus.mockResolvedValue({
      status: 'subscription_active',
    });
    renderSecurity();
    expect(await screen.findByText('delete_subscription_active')).toBeVisible();
    expect(screen.getByRole('button', { name: 'delete' })).toBeDisabled();
  });

  it('associates the typed-name label and blocks an incorrect name', async () => {
    renderSecurity();
    const trigger = screen.getByRole('button', { name: 'delete' });
    await waitFor(() => expect(trigger).toBeEnabled());
    fireEvent.click(trigger);
    const dialog = within(screen.getByRole('alertdialog'));
    fireEvent.change(
      dialog.getByRole('textbox', { name: 'delete_confirmation_prompt' }),
      {
        target: { value: 'Wrong name' },
      }
    );
    expect(dialog.getByRole('button', { name: 'delete' })).toBeDisabled();
    expect(mocks.deleteWorkspace).not.toHaveBeenCalled();
  });
});
