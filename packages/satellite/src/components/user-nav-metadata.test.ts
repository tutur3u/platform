import { describe, expect, it } from 'vitest';
import { resolveUserNavSecondaryLabel } from './user-nav-metadata';

const baseInput = {
  email: 'member@example.com',
  workspaceName: 'Studio North',
  workspacePersonal: false,
  workspaceSelectorVisible: false,
};

describe('resolveUserNavSecondaryLabel', () => {
  it('shows the workspace name when its sidebar selector is hidden', () => {
    expect(resolveUserNavSecondaryLabel(baseInput)).toBe('Studio North');
  });

  it('shows the email when the sidebar workspace selector is visible', () => {
    expect(
      resolveUserNavSecondaryLabel({
        ...baseInput,
        workspaceSelectorVisible: true,
      })
    ).toBe('member@example.com');
  });

  it('does not replace the email for personal workspaces', () => {
    expect(
      resolveUserNavSecondaryLabel({ ...baseInput, workspacePersonal: true })
    ).toBe('member@example.com');
  });

  it.each(['owner@example.com', 'owner@', '  '])(
    'does not expose an email-like workspace name: %s',
    (workspaceName) => {
      expect(
        resolveUserNavSecondaryLabel({ ...baseInput, workspaceName })
      ).toBe('member@example.com');
    }
  );
});
