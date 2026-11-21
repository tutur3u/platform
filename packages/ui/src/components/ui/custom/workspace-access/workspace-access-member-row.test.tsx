import { fireEvent, render, screen } from '@testing-library/react';
import type { InternalApiEnhancedWorkspaceMember } from '@tuturuuu/types';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceAccessLabels } from './types';
import { WorkspaceAccessMemberRow } from './workspace-access-member-row';

vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}));

const HINT = 'ws-members.direct_board_guest_manage_hint';

const labels: WorkspaceAccessLabels = {
  accessLevelsLabel: 'Access levels',
  assignRolePlaceholder: 'Assign role',
  clearFiltersAction: 'Clear filters',
  filterByPermission: 'Filter by permission',
  filterByRole: 'Filter by role',
  noAdditionalRoles: 'No additional roles',
  noRolesLabel: 'No roles',
  protectedMemberLabel: 'Protected member',
  removeMemberAction: 'Remove member',
  rolesEmptyDescription: 'No roles yet',
  rolesEmptyTitle: 'Roles',
};

function boardGuest(
  overrides: Partial<InternalApiEnhancedWorkspaceMember>
): InternalApiEnhancedWorkspaceMember {
  return {
    default_permissions: [],
    direct_board_guest: true,
    display_name: 'Board guest',
    email: 'guest@example.com',
    guest_board_count: 1,
    guest_board_names: ['Launch'],
    guest_highest_permission: 'view',
    is_creator: false,
    roles: [],
    workspace_member_type: 'GUEST',
    ...overrides,
  } as InternalApiEnhancedWorkspaceMember;
}

const pendingGuest = boardGuest({
  id: 'board-guest:guest@example.com',
  pending: true,
});
const accountGuest = boardGuest({
  id: '11111111-1111-4111-8111-111111111111',
  pending: false,
});
const member = {
  default_permissions: [],
  display_name: 'Member',
  email: 'member@example.com',
  id: '22222222-2222-4222-8222-222222222222',
  is_creator: false,
  roles: [],
  workspace_member_type: 'MEMBER',
} as unknown as InternalApiEnhancedWorkspaceMember;
const creator = {
  ...member,
  email: 'creator@example.com',
  id: '33333333-3333-4333-8333-333333333333',
  is_creator: true,
} as InternalApiEnhancedWorkspaceMember;

function renderRow(
  rowMember: InternalApiEnhancedWorkspaceMember,
  props: Partial<ComponentProps<typeof WorkspaceAccessMemberRow>> = {}
) {
  const onRemoveMember = vi.fn();
  render(
    <WorkspaceAccessMemberRow
      canEditProfiles={false}
      canManageMembers
      canManageRoles={false}
      canUpdateInvitationRoles={false}
      defaultAdminEnabled={false}
      isMutating={false}
      labels={labels}
      member={rowMember}
      onAssignRole={vi.fn()}
      onEditMemberProfile={vi.fn()}
      onRemoveMember={onRemoveMember}
      onRemoveRole={vi.fn()}
      onUpdateInvitationRole={vi.fn()}
      roles={[{ id: 'role-editor', name: 'Editor' }]}
      {...props}
    />
  );
  return { onRemoveMember };
}

function openActions() {
  fireEvent.pointerDown(
    screen.getByRole('button', { name: 'common.actions' }),
    {
      button: 0,
      ctrlKey: false,
    }
  );
}

describe('WorkspaceAccessMemberRow', () => {
  it('points a guest without an account to board sharing instead of Remove', () => {
    renderRow(pendingGuest);

    expect(screen.getByText(HINT)).toBeDefined();
    expect(screen.queryByRole('button', { name: 'common.actions' })).toBeNull();
  });

  it('keeps role actions but drops Remove for a board guest with an account', async () => {
    renderRow(accountGuest, { canManageRoles: true });

    expect(screen.getByText(HINT)).toBeDefined();
    openActions();
    expect(await screen.findByText('Assign role')).toBeDefined();
    expect(screen.queryByText('Remove member')).toBeNull();
  });

  it('offers Remove for board guests when the host removal revokes board shares', async () => {
    const { onRemoveMember } = renderRow(accountGuest, {
      canRemoveBoardGuests: true,
    });

    expect(screen.queryByText(HINT)).toBeNull();
    openActions();
    fireEvent.click(await screen.findByText('Remove member'));
    expect(onRemoveMember).toHaveBeenCalledWith({
      email: 'guest@example.com',
      userId: accountGuest.id,
    });
  });

  it('removes a board guest without an account by email alone', async () => {
    const { onRemoveMember } = renderRow(pendingGuest, {
      canRemoveBoardGuests: true,
    });

    openActions();
    fireEvent.click(await screen.findByText('Remove member'));
    expect(onRemoveMember).toHaveBeenCalledWith({
      email: 'guest@example.com',
      userId: null,
    });
  });

  it('removes an ordinary member with their id and email', async () => {
    const { onRemoveMember } = renderRow(member);

    expect(screen.queryByText(HINT)).toBeNull();
    openActions();
    fireEvent.click(await screen.findByText('Remove member'));
    expect(onRemoveMember).toHaveBeenCalledWith({
      email: 'member@example.com',
      userId: member.id,
    });
  });

  it('shows the creator as protected without Remove', async () => {
    renderRow(creator);

    openActions();
    expect(await screen.findByText('Protected member')).toBeDefined();
    expect(screen.queryByText('Remove member')).toBeNull();
  });

  it('shows no board sharing hint to people who cannot manage members', () => {
    renderRow(pendingGuest, { canManageMembers: false });

    expect(screen.queryByText(HINT)).toBeNull();
  });
});
