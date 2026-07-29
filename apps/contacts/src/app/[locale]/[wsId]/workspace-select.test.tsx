import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceSelect } from './workspace-select';

const listWorkspacesMock = vi.fn();

vi.mock('@tuturuuu/internal-api/workspaces', () => ({
  listWorkspaces: (...args: unknown[]) => listWorkspacesMock(...args),
}));

vi.mock('@tuturuuu/ui/custom/workspace-select', () => ({
  WorkspaceSelect: ({
    fetchWorkspaces,
  }: Pick<
    ComponentProps<
      typeof import('@tuturuuu/ui/custom/workspace-select').WorkspaceSelect
    >,
    'fetchWorkspaces'
  >) => (
    <button onClick={() => void fetchWorkspaces()} type="button">
      Load workspaces
    </button>
  ),
}));

describe('Contacts WorkspaceSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads workspaces through the stable internal API client', async () => {
    listWorkspacesMock.mockResolvedValue([]);

    render(<WorkspaceSelect wsId="ws-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Load workspaces' }));

    await waitFor(() => {
      expect(listWorkspacesMock).toHaveBeenCalledOnce();
    });
  });
});
