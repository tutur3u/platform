import { describe, expect, it } from 'vitest';
import {
  createWorkspaceMembersNavLink,
  createWorkspaceSettingsNavGroup,
} from './navigation';

const t = (key: string) => key;

describe('satellite workspace settings navigation', () => {
  it('exposes all workspace management destinations', () => {
    const group = createWorkspaceSettingsNavGroup(t);

    expect(group.label).toBe('satellite-workspace-settings.title');
    expect(group.items.map((item) => item.name)).toEqual([
      'workspace_general',
      'workspace_members',
      'workspace_billing',
    ]);
  });

  it('opens member management in the current app settings dialog', () => {
    const link = createWorkspaceMembersNavLink(t);

    expect(link.href).toBeUndefined();
    expect(link.openSettingsDialog).toEqual({ tab: 'workspace_members' });
    expect(link.title).toBe('satellite-workspace-settings.manage_members');
  });
});
