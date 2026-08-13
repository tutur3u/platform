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

    expect(
      screen.getByRole('tab', {
        name: 'ws-members.invite_access_member_tab',
      })
    ).toHaveAttribute('data-state', 'active');
    expect(screen.getByText('ws-members.role-placeholder')).toBeDefined();
    expect(
      screen.getByPlaceholderText('ws-members.invite_roles_search')
    ).toBeDefined();

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

    fireEvent.mouseDown(
      screen.getByRole('tab', {
        name: 'ws-members.invite_access_guest_tab',
      })
    );
    expect(props.onAccessPresetChange).toHaveBeenLastCalledWith('guest');

    rerender(
      <WorkspaceAccessInviteDialog
        {...props}
        accessPreset="guest"
        roleIds={[]}
      />
    );
    expect(screen.queryByRole('checkbox', { name: 'Editor' })).toBeNull();
  });

  it('filters roles, clears the selection, and lets the role section collapse', () => {
    const onRoleIdsChange = vi.fn();

    render(
      <WorkspaceAccessInviteDialog
        accessPreset="member"
        canManageRoles
        confirmDefaultAdminMigration={false}
        defaultAdminEnabled={false}
        emails="editor@example.com"
        isSubmitting={false}
        joinedMemberCount={1}
        noRoleLabel="No assigned roles"
        onAccessPresetChange={vi.fn()}
        onConfirmDefaultAdminMigrationChange={vi.fn()}
        onEmailsChange={vi.fn()}
        onOpenChange={vi.fn()}
        onRoleIdsChange={onRoleIdsChange}
        onSubmit={vi.fn()}
        open
        roleIds={['role-editor', 'role-reviewer']}
        roles={[
          { id: 'role-editor', name: 'Editor' },
          { id: 'role-reviewer', name: 'Reviewer' },
        ]}
      />
    );

    fireEvent.change(
      screen.getByPlaceholderText('ws-members.invite_roles_search'),
      { target: { value: 'review' } }
    );
    expect(screen.queryByRole('checkbox', { name: 'Editor' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Reviewer' })).toBeDefined();

    fireEvent.click(
      screen.getByRole('button', { name: 'ws-members.clear_all_roles' })
    );
    expect(onRoleIdsChange).toHaveBeenLastCalledWith([]);

    fireEvent.click(
      screen.getByRole('button', {
        name: /ws-members\.role-placeholder/,
      })
    );
    expect(
      screen.queryByPlaceholderText('ws-members.invite_roles_search')
    ).toBeNull();
  });
});
