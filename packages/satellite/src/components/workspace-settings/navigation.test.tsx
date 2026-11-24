import { describe, expect, it } from 'vitest';
import { createWorkspaceSettingsNavGroup } from './navigation';

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
});
