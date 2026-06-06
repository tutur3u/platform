import type { InternalApiWorkspaceSummary } from '@tuturuuu/types';
import { describe, expect, it } from 'vitest';
import { mergeWorkspaceSelectWorkspaces } from '../workspace-select-helpers';

describe('mergeWorkspaceSelectWorkspaces', () => {
  it('uses the current workspace fallback when the workspace list is unavailable', () => {
    const fallback: InternalApiWorkspaceSummary = {
      access_type: 'guest',
      avatar_url: null,
      guest_board_count: 1,
      guest_highest_permission: 'edit',
      guest_landing_path: '/tasks/boards/board-1',
      guest_products: ['tasks'],
      id: 'guest-workspace',
      logo_url: null,
      name: 'Shared workspace',
      personal: false,
    };

    expect(mergeWorkspaceSelectWorkspaces(undefined, fallback)).toEqual([
      fallback,
    ]);
  });

  it('does not duplicate the current workspace when the list already includes it', () => {
    const workspace: InternalApiWorkspaceSummary = {
      access_type: 'member',
      avatar_url: null,
      id: 'workspace-1',
      logo_url: null,
      name: 'Workspace',
      personal: false,
    };

    expect(mergeWorkspaceSelectWorkspaces([workspace], workspace)).toEqual([
      workspace,
    ]);
  });
});
