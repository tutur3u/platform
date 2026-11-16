import { describe, expect, it } from 'vitest';
import { ROOT_WORKSPACE_ID } from './constants';
import {
  DELETE_WORKSPACE_PERMISSION,
  getWorkspaceDeletionBlock,
  isWorkspaceDeletionConfirmed,
} from './workspace-deletion';

const permissionsWith = (...granted: string[]) => ({
  containsPermission: (permission: string) => granted.includes(permission),
});

const allowed = {
  workspaceId: '00000000-0000-0000-0000-000000000011',
  personal: false,
  permissions: permissionsWith(DELETE_WORKSPACE_PERMISSION),
  deletionPrevented: false,
  hasActivePaidSubscription: false,
};

describe('getWorkspaceDeletionBlock', () => {
  it('allows deletion only when every rule passes', () => {
    expect(DELETE_WORKSPACE_PERMISSION).toBe('manage_workspace_security');
    expect(getWorkspaceDeletionBlock(allowed)).toBeNull();
  });

  it.each([
    ['root', { workspaceId: ROOT_WORKSPACE_ID }],
    ['personal', { personal: true }],
    ['permission', { permissions: null }],
    [
      'permission',
      { permissions: permissionsWith('manage_workspace_settings') },
    ],
    ['prevented', { deletionPrevented: true }],
    ['subscription', { hasActivePaidSubscription: true }],
  ] as const)('blocks with %s', (block, override) => {
    expect(getWorkspaceDeletionBlock({ ...allowed, ...override })).toBe(block);
  });

  it('reports the root refusal before any other reason', () => {
    expect(
      getWorkspaceDeletionBlock({
        ...allowed,
        workspaceId: ROOT_WORKSPACE_ID,
        permissions: null,
        hasActivePaidSubscription: true,
      })
    ).toBe('root');
  });
});

describe('isWorkspaceDeletionConfirmed', () => {
  const workspace = { name: 'Acme Team', handle: 'acme' };

  it('accepts the exact name or handle, ignoring outer spaces', () => {
    expect(isWorkspaceDeletionConfirmed('Acme Team', workspace)).toBe(true);
    expect(isWorkspaceDeletionConfirmed('  acme ', workspace)).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isWorkspaceDeletionConfirmed('acme team', workspace)).toBe(false);
    expect(isWorkspaceDeletionConfirmed('', workspace)).toBe(false);
    expect(isWorkspaceDeletionConfirmed(undefined, workspace)).toBe(false);
    expect(
      isWorkspaceDeletionConfirmed('anything', { name: null, handle: null })
    ).toBe(false);
  });
});
