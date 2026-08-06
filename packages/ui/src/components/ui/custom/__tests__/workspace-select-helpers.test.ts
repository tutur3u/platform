import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { InternalApiWorkspaceSummary } from '@tuturuuu/types';
import { describe, expect, it } from 'vitest';
import {
  buildWorkspaceSetupHandoffUrl,
  mergeWorkspaceSelectWorkspaces,
  normalizeWorkspaceSwitchPath,
  resolveWorkspaceAvatarUrl,
} from '../workspace-select-helpers';

describe('buildWorkspaceSetupHandoffUrl', () => {
  it('builds a localized Platform setup URL with an encoded satellite return', () => {
    const handoffUrl = new URL(
      buildWorkspaceSetupHandoffUrl({
        locale: 'vi',
        platformUrl: 'https://tuturuuu.com',
        returnOrigin: 'https://tasks.tuturuuu.com',
        returnPath: '/workspace-1/tasks?view=mine',
        workspaceId: 'workspace-1',
      })
    );

    expect(handoffUrl.pathname).toBe('/vi/workspace-1/workspace-setup');
    expect(handoffUrl.searchParams.get('returnUrl')).toBe(
      'https://tasks.tuturuuu.com/vi/workspace-1/tasks?view=mine'
    );
  });

  it('does not duplicate an existing locale prefix', () => {
    const handoffUrl = new URL(
      buildWorkspaceSetupHandoffUrl({
        locale: 'en',
        platformUrl: 'http://platform.tuturuuu.localhost',
        returnOrigin: 'http://meet.tuturuuu.localhost',
        returnPath: '/en/workspace/workspace-1',
        workspaceId: 'workspace-1',
      })
    );

    expect(handoffUrl.searchParams.get('returnUrl')).toBe(
      'http://meet.tuturuuu.localhost/en/workspace/workspace-1'
    );
  });

  it('rejects a return path that changes the satellite origin', () => {
    expect(() =>
      buildWorkspaceSetupHandoffUrl({
        locale: 'en',
        platformUrl: 'https://tuturuuu.com',
        returnOrigin: 'https://tasks.tuturuuu.com',
        returnPath: 'https://evil.example/workspace-1',
        workspaceId: 'workspace-1',
      })
    ).toThrow('Workspace return path must stay on the current app');
  });
});

describe('resolveWorkspaceAvatarUrl', () => {
  it('preserves a valid hosted avatar when an app provides a local fallback', () => {
    expect(
      resolveWorkspaceAvatarUrl(
        'https://tuturuuu.com/media/logos/transparent.png',
        {
          rootWorkspaceLogoUrl: '/media/logos/transparent.png',
        }
      )
    ).toBe('https://tuturuuu.com/media/logos/transparent.png');
  });

  it('uses the canonical root logo only when the root workspace has no avatar', () => {
    expect(
      resolveWorkspaceAvatarUrl(null, {
        rootWorkspaceLogoUrl:
          'https://tuturuuu.com/media/logos/transparent.png',
      })
    ).toBe('https://tuturuuu.com/media/logos/transparent.png');
    expect(resolveWorkspaceAvatarUrl(null)).toBeNull();
  });
});

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

  it('keeps workspace fallback images outside Radix AvatarImage context', () => {
    const workspaceIconSource = readFileSync(
      join(process.cwd(), 'src/components/ui/custom/workspace-select-icon.tsx'),
      'utf8'
    );

    expect(workspaceIconSource).toContain('<AvatarFallback');
    expect(workspaceIconSource).toContain('<Image');
    expect(workspaceIconSource).not.toMatch(
      /<AvatarFallback[\s\S]*<AvatarImage/u
    );
  });

  it('lays out the short create and join actions in the command item grid', () => {
    const workspaceSelectSource = readFileSync(
      join(process.cwd(), 'src/components/ui/custom/workspace-select.tsx'),
      'utf8'
    );

    expect(workspaceSelectSource).toContain(
      '[&_[cmdk-group-items]]:grid-cols-2'
    );
    expect(workspaceSelectSource).toContain(
      "t('common.create_workspace_action')"
    );
    expect(workspaceSelectSource).toContain(
      "t('common.join_workspace_action')"
    );
  });

  it('supports a modal popover so nested settings pickers remain scrollable', () => {
    const workspaceSelectSource = readFileSync(
      join(process.cwd(), 'src/components/ui/custom/workspace-select.tsx'),
      'utf8'
    );

    expect(workspaceSelectSource).toContain('popoverModal = false');
    expect(workspaceSelectSource).toContain('<Popover modal={popoverModal}');
  });

  it('focuses workspace search as soon as the picker opens', () => {
    const workspaceSelectSource = readFileSync(
      join(process.cwd(), 'src/components/ui/custom/workspace-select.tsx'),
      'utf8'
    );

    expect(workspaceSelectSource).toContain(
      '<CommandInput autoFocus placeholder="Search workspace..." />'
    );
  });
});

describe('normalizeWorkspaceSwitchPath', () => {
  it('lands on tasks when switching workspace from a canonical task board detail route', () => {
    expect(
      normalizeWorkspaceSwitchPath('/personal/boards/board-1', 'personal')
    ).toBe('/personal/tasks');
  });

  it('lands on tasks when switching workspace from the canonical task boards index', () => {
    expect(normalizeWorkspaceSwitchPath('/personal/boards', 'personal')).toBe(
      '/personal/tasks'
    );
  });

  it('lands on tasks when switching workspace from a task board detail route', () => {
    expect(
      normalizeWorkspaceSwitchPath('/personal/tasks/boards/board-1', 'personal')
    ).toBe('/personal/tasks');
  });

  it('lands on tasks when switching workspace from the task boards index', () => {
    expect(
      normalizeWorkspaceSwitchPath('/personal/tasks/boards', 'personal')
    ).toBe('/personal/tasks');
  });

  it('preserves existing UUID detail-route stripping for non-task-board routes', () => {
    expect(
      normalizeWorkspaceSwitchPath(
        '/workspace-1/users/11111111-1111-4111-8111-111111111111',
        'workspace-1'
      )
    ).toBe('/workspace-1/users');
  });
});
