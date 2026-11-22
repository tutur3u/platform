/** @vitest-environment jsdom */

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { Workspace } from '@tuturuuu/types';
import { describe, expect, it, vi } from 'vitest';
import RemoveYourself from './remove-yourself';

const mocks = vi.hoisted(() => ({
  error: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  remove: vi.fn(),
  success: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/workspaces', () => ({
  removeWorkspaceMember: mocks.remove,
}));
vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: { error: mocks.error, success: mocks.success },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}));

describe('Leave workspace', () => {
  it('shows the leave-specific manager refusal and stays in the workspace', async () => {
    const error = Object.assign(new Error('Manager floor'), {
      code: 'WORKSPACE_LAST_MANAGER',
    });
    mocks.remove.mockRejectedValue(error);
    const workspace = {
      id: 'ws-id',
      name: 'Team',
      joined: true,
    } as Workspace & {
      joined: boolean;
    };
    render(<RemoveYourself currentUserId="member-id" workspace={workspace} />);

    const leaveLabel = 'ws-settings.leave_workspace';
    fireEvent.click(screen.getByRole('button', { name: leaveLabel }));
    const dialog = within(await screen.findByRole('alertdialog'));
    fireEvent.change(dialog.getByRole('textbox'), {
      target: { value: 'Team' },
    });
    fireEvent.click(dialog.getByRole('button', { name: leaveLabel }));

    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledExactlyOnceWith(
        'ws-members.last_manager_leave_refused'
      )
    );
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith('ws-id', {
      userId: 'member-id',
    });
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });
});
