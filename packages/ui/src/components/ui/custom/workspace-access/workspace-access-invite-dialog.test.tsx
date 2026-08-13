import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceAccessInviteDialog } from './workspace-access-invite-dialog';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('WorkspaceAccessInviteDialog', () => {
  it('offers and maps an optional workspace role before the invitation is sent', () => {
    const props = {
      accessPreset: 'member',
      canManageRoles: true,
      confirmDefaultAdminMigration: false,
      defaultAdminEnabled: false,
      emails: 'editor@example.com',
      isSubmitting: false,
      joinedMemberCount: 1,
      noRoleLabel: 'No assigned roles',
      onAccessPresetChange: vi.fn(),
      onConfirmDefaultAdminMigrationChange: vi.fn(),
      onEmailsChange: vi.fn(),
      onOpenChange: vi.fn(),
      onRoleIdChange: vi.fn(),
      onSubmit: vi.fn(),
      open: true,
      roleId: null,
      roles: [{ id: 'role-editor', name: 'Editor' }],
    } as ComponentProps<typeof WorkspaceAccessInviteDialog> & {
      noRoleLabel: string;
      onRoleIdChange: (roleId: string | null) => void;
      roleId: string | null;
      roles: Array<{ id: string; name: string }>;
    };

    const { rerender } = render(<WorkspaceAccessInviteDialog {...props} />);

    expect(screen.getByText('ws-members.role-placeholder')).toBeDefined();
    expect(screen.getByText('No assigned roles')).toBeDefined();

    fireEvent.click(
      screen.getByRole('combobox', { name: 'ws-members.role-placeholder' })
    );
    fireEvent.click(screen.getByText('Editor'));
    expect(props.onRoleIdChange).toHaveBeenLastCalledWith('role-editor');

    rerender(<WorkspaceAccessInviteDialog {...props} roleId="role-editor" />);
    fireEvent.click(
      screen.getByRole('combobox', { name: 'ws-members.role-placeholder' })
    );
    fireEvent.click(screen.getByText('No assigned roles'));
    expect(props.onRoleIdChange).toHaveBeenLastCalledWith(null);

    rerender(
      <WorkspaceAccessInviteDialog
        {...props}
        accessPreset="guest"
        roleId={null}
      />
    );
    expect(
      screen.queryByRole('combobox', {
        name: 'ws-members.role-placeholder',
      })
    ).toBeNull();
  });
});
