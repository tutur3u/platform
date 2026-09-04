import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceAccessInvitationRoleMenu } from './workspace-access-invitation-role-menu';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, number>) =>
    values?.count === undefined ? key : `${values.count} ${key}`,
}));

describe('WorkspaceAccessInvitationRoleMenu', () => {
  it('presents an actionable empty state and adds roles to an email invite', async () => {
    const onUpdate = vi.fn();
    render(
      <WorkspaceAccessInvitationRoleMenu
        email="pending@example.com"
        isMutating={false}
        onUpdate={onUpdate}
        assignedRoles={[]}
        roles={[
          { id: 'role-editor', name: 'Editor' },
          { id: 'role-reviewer', name: 'Reviewer' },
        ]}
      />
    );

    expect(
      screen.getByRole('button', {
        name: /ws-members.assign_invitation_role/i,
      })
    ).toBeDefined();
    expect(screen.getByText('ws-members.invitation_role_helper')).toBeDefined();

    fireEvent.pointerDown(
      screen.getByRole('button', {
        name: /ws-members.assign_invitation_role/i,
      }),
      { button: 0, ctrlKey: false }
    );
    fireEvent.click(await screen.findByText('Editor'));

    expect(onUpdate).toHaveBeenCalledWith({
      email: 'pending@example.com',
      roleIds: ['role-editor'],
      userId: undefined,
    });
  });

  it('shows all assigned roles and removes only the selected role', async () => {
    const onUpdate = vi.fn();
    render(
      <WorkspaceAccessInvitationRoleMenu
        isMutating={false}
        onUpdate={onUpdate}
        assignedRoles={[
          { id: 'role-editor', name: 'Editor' },
          { id: 'role-reviewer', name: 'Reviewer' },
        ]}
        roles={[
          { id: 'role-editor', name: 'Editor' },
          { id: 'role-reviewer', name: 'Reviewer' },
        ]}
        userId="user-2"
      />
    );

    fireEvent.pointerDown(
      screen.getByRole('button', { name: /2 ws-members.roles_selected/i }),
      { button: 0, ctrlKey: false }
    );
    const reviewerLabels = await screen.findAllByText('Reviewer');
    fireEvent.click(reviewerLabels.at(-1)!);

    expect(onUpdate).toHaveBeenCalledWith({
      email: undefined,
      roleIds: ['role-editor'],
      userId: 'user-2',
    });
  });
});
