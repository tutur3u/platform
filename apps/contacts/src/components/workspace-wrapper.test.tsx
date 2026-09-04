import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getContactsWorkspace: vi.fn(),
}));

vi.mock('@/lib/workspace', () => ({
  getContactsWorkspace: mocks.getContactsWorkspace,
}));

import WorkspaceWrapper from './workspace-wrapper';

describe('Contacts WorkspaceWrapper', () => {
  it('does not execute child loaders for the reserved group selector', async () => {
    const children = vi.fn();

    await expect(
      WorkspaceWrapper({
        children,
        params: Promise.resolve({ groupId: '~', wsId: 'personal' }),
      })
    ).resolves.toBeNull();

    expect(mocks.getContactsWorkspace).not.toHaveBeenCalled();
    expect(children).not.toHaveBeenCalled();
  });
});
