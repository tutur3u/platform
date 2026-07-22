import { describe, expect, it } from 'vitest';
import { createWorkspaceMembersNavigationLink } from './workspace-members-navigation';

const t = (key: string) => key;

describe('createWorkspaceMembersNavigationLink', () => {
  it('opens member settings for authorized team workspaces', () => {
    expect(
      createWorkspaceMembersNavigationLink({
        canManageMembers: true,
        isPersonal: false,
        preferenceSectionLabel: 'Utilities',
        t,
      })
    ).toMatchObject({
      id: 'workspace-members-settings',
      openSettingsDialog: { tab: 'workspace_members' },
      preferenceLocked: true,
      preferenceSectionLabel: 'Utilities',
      title: 'satellite-workspace-settings.manage_members',
    });
  });

  it('never exposes member management in personal workspaces', () => {
    expect(
      createWorkspaceMembersNavigationLink({
        canManageMembers: true,
        isPersonal: true,
        preferenceSectionLabel: 'Utilities',
        t,
      })
    ).toBeNull();
  });

  it('hides the shortcut without member-management permission', () => {
    expect(
      createWorkspaceMembersNavigationLink({
        canManageMembers: false,
        isPersonal: false,
        preferenceSectionLabel: 'Utilities',
        t,
      })
    ).toBeNull();
  });
});
