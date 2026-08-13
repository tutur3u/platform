import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceAccessInviteDialog } from './workspace-access-invite-dialog';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, number>) =>
    values?.count === undefined ? key : `${values.count} ${key}`,
}));

describe('WorkspaceAccessInviteDialog', () => {
  it('selects multiple workspace roles before the invitation is sent', () => {
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
      onRoleIdsChange: vi.fn(),
      onSubmit: vi.fn(),
      open: true,
      roleIds: [],
      roles: [
        { id: 'role-editor', name: 'Editor' },
        { id: 'role-reviewer', name: 'Reviewer' },
      ],
    } as ComponentProps<typeof WorkspaceAccessInviteDialog> & {
      noRoleLabel: string;
      onRoleIdsChange: (roleIds: string[]) => void;
      roleIds: string[];
      roles: Array<{ id: string; name: string }>;
    };

    const { rerender } = render(<WorkspaceAccessInviteDialog {...props} />);

    expect(screen.getByText('ws-members.role-placeholder')).toBeDefined();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Editor' }));
    expect(props.onRoleIdsChange).toHaveBeenLastCalledWith(['role-editor']);

    rerender(
      <WorkspaceAccessInviteDialog {...props} roleIds={['role-editor']} />
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Reviewer' }));
    expect(props.onRoleIdsChange).toHaveBeenLastCalledWith([
      'role-editor',
      'role-reviewer',
    ]);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Editor' }));
    expect(props.onRoleIdsChange).toHaveBeenLastCalledWith([]);

    rerender(
      <WorkspaceAccessInviteDialog
        {...props}
        accessPreset="guest"
        roleIds={[]}
      />
    );
    expect(screen.queryByRole('checkbox', { name: 'Editor' })).toBeNull();
  });
});
