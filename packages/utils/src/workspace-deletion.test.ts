import { describe, expect, it } from 'vitest';
import { ROOT_WORKSPACE_ID } from './constants';
import {
  isWorkspaceDeletionConfirmed,
  isWorkspaceDeletionOwner,
} from './workspace-deletion';

const workspace = {
  id: '00000000-0000-0000-0000-000000000011',
  creator_id: 'owner',
  personal: false,
};

describe('isWorkspaceDeletionOwner', () => {
  it('allows the owner of a team workspace', () => {
    expect(isWorkspaceDeletionOwner(workspace, 'owner')).toBe(true);
  });

  it.each([
    [workspace, 'workspace-settings-manager'],
    [workspace, undefined],
    [{ ...workspace, personal: true }, 'owner'],
    [{ ...workspace, id: ROOT_WORKSPACE_ID }, 'owner'],
  ] as const)('rejects %j for %s', (candidate, actorId) => {
    expect(isWorkspaceDeletionOwner(candidate, actorId)).toBe(false);
  });
});

describe('isWorkspaceDeletionConfirmed', () => {
  it('accepts only the workspace name, ignoring outer spaces', () => {
    const named = { name: 'Acme Team', handle: 'acme' };
    expect(isWorkspaceDeletionConfirmed('  Acme Team ', named)).toBe(true);
    expect(isWorkspaceDeletionConfirmed('acme', named)).toBe(false);
    expect(isWorkspaceDeletionConfirmed('acme team', named)).toBe(false);
    expect(isWorkspaceDeletionConfirmed('', named)).toBe(false);
    expect(isWorkspaceDeletionConfirmed(undefined, named)).toBe(false);
    expect(isWorkspaceDeletionConfirmed('anything', { name: null })).toBe(
      false
    );
  });
});
