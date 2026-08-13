import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceAccessInviteDialog } from './workspace-access-invite-dialog';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('WorkspaceAccessInviteDialog', () => {
  it('offers an optional workspace role before the invitation is sent', () => {
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

    render(<WorkspaceAccessInviteDialog {...props} />);

    expect(screen.getByText('ws-members.role-placeholder')).toBeDefined();
    expect(screen.getByText('No assigned roles')).toBeDefined();
  });
});
