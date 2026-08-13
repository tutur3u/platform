import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceAccessInvitationRoleMenu } from './workspace-access-invitation-role-menu';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('WorkspaceAccessInvitationRoleMenu', () => {
  it('presents an actionable empty state and assigns a role to an email invite', async () => {
    const onUpdate = vi.fn();
    render(
      <WorkspaceAccessInvitationRoleMenu
        email="pending@example.com"
        isMutating={false}
        onUpdate={onUpdate}
        roles={[{ id: 'role-editor', name: 'Editor' }]}
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
      roleId: 'role-editor',
      userId: undefined,
    });
  });

  it('shows the assigned role and allows clearing a registered-user invite', async () => {
    const onUpdate = vi.fn();
    render(
      <WorkspaceAccessInvitationRoleMenu
        isMutating={false}
        onUpdate={onUpdate}
        role={{ id: 'role-reviewer', name: 'Reviewer' }}
        roles={[{ id: 'role-reviewer', name: 'Reviewer' }]}
        userId="user-2"
      />
    );

    fireEvent.pointerDown(screen.getByRole('button', { name: /Reviewer/i }), {
      button: 0,
      ctrlKey: false,
    });
    fireEvent.click(await screen.findByText('ws-members.no_role_assigned'));

    expect(onUpdate).toHaveBeenCalledWith({
      email: undefined,
      roleId: null,
      userId: 'user-2',
    });
  });
});
