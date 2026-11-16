import { describe, expect, it, vi } from 'vitest';
import { pastCollapseChoice, pastPreference } from './preference';

const update = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ message: 'Saved' })
);
vi.mock('@tuturuuu/internal-api', () => ({
  updateUserWorkspaceConfig: update,
}));
import { savePastCollapseChoice } from './preference.client';

describe('Past collapse persistence', () => {
  it('defaults missing or invalid values to collapsed', () => {
    for (const value of [null, undefined, '', 'invalid', false, 'collapsed']) {
      expect(pastCollapseChoice(value)).toBe('collapsed');
    }
    expect(pastCollapseChoice('expanded')).toBe('expanded');
  });

  it('scopes the model to both account and canonical workspace', () => {
    const a = pastPreference('account-a', 'workspace-a', 'expanded');
    const b = pastPreference('account-b', 'workspace-a', null);
    const c = pastPreference('account-a', 'workspace-b', null);
    expect(a).toEqual({
      store: 'user-workspace-config',
      configId: 'MEET_PAST_MEETINGS_COLLAPSE',
      accountId: 'account-a',
      workspaceId: 'workspace-a',
      choice: 'expanded',
    });
    expect(b.accountId).not.toBe(a.accountId);
    expect(c.workspaceId).not.toBe(a.workspaceId);
    expect(b.choice).toBe('collapsed');
  });

  it('saves the choice through the existing authenticated workspace API', async () => {
    await savePastCollapseChoice('workspace-a', 'expanded');
    expect(update).toHaveBeenCalledWith(
      'workspace-a',
      'MEET_PAST_MEETINGS_COLLAPSE',
      'expanded'
    );
  });
});
