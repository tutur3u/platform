import { describe, expect, it } from 'vitest';
import { resolveUserNavSecondaryLabel } from './user-nav-metadata';

const baseInput = {
  email: 'member@example.com',
  workspaceName: 'Studio North',
  workspacePersonal: false,
  workspaceSelectorVisible: false,
};

describe('resolveUserNavSecondaryLabel', () => {
  it('uses the workspace name when the selector is hidden', () => {
    expect(resolveUserNavSecondaryLabel(baseInput)).toBe('Studio North');
  });

  it('uses email while the workspace selector is visible', () => {
    expect(
      resolveUserNavSecondaryLabel({
        ...baseInput,
        workspaceSelectorVisible: true,
      })
    ).toBe('member@example.com');
  });

  it('always uses email in a personal workspace', () => {
    expect(
      resolveUserNavSecondaryLabel({
        ...baseInput,
        workspacePersonal: true,
      })
    ).toBe('member@example.com');
  });

  it.each(['workspace@example.com', 'workspace@example'])(
    'falls back to email for email-like workspace name %s',
    (workspaceName) => {
      expect(
        resolveUserNavSecondaryLabel({ ...baseInput, workspaceName })
      ).toBe('member@example.com');
    }
  );
});
