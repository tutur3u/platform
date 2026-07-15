/**
 * @vitest-environment jsdom
 */

import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TaskMediaPermissionDialog } from './task-media-permission-dialog';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('TaskMediaPermissionDialog', () => {
  it('shows the required permission, membership, and assigned roles', () => {
    render(
      <TaskMediaPermissionDialog
        access={{
          effectivePermissions: [],
          hasPermission: false,
          membershipType: 'MEMBER',
          permission: 'manage_drive_tasks_directory',
          roles: [
            { id: 'role-1', name: 'Contributor' },
            { id: 'role-2', name: 'Reviewer' },
          ],
        }}
        onOpenChange={vi.fn()}
        open={true}
      />
    );

    expect(screen.getByText('title')).toBeInTheDocument();
    expect(screen.getByText('not_granted')).toBeInTheDocument();
    expect(screen.getByText('membership_member')).toBeInTheDocument();
    expect(
      screen.getByText('manage_drive_tasks_directory')
    ).toBeInTheDocument();
    expect(screen.getByText('Contributor')).toBeInTheDocument();
    expect(screen.getByText('Reviewer')).toBeInTheDocument();
    expect(screen.getByText('denied_help')).toBeInTheDocument();
  });

  it('shows effective administrator access and closes from the action', () => {
    const onOpenChange = vi.fn();
    render(
      <TaskMediaPermissionDialog
        access={{
          effectivePermissions: ['admin'],
          hasPermission: true,
          membershipType: 'MEMBER',
          permission: 'manage_drive_tasks_directory',
          roles: [],
        }}
        onOpenChange={onOpenChange}
        open={true}
      />
    );

    expect(screen.getByText('granted')).toBeInTheDocument();
    expect(screen.getByText('administrator_access')).toBeInTheDocument();
    expect(screen.getByText('no_roles')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
