import { describe, expect, it } from 'vitest';
import { avatarStorageOrigins } from '../avatar-storage-origins';
import {
  isWorkspaceAvatarPath,
  ownedWorkspaceAvatarPath,
} from '../workspace-avatar';

const workspace = 'abcdef01-2345-4678-9abc-def012345678';
const filename = 'avatar-00000000-0000-4000-8000-000000000001.webp';
const path = (wsId: string) => `workspaces/${wsId}/${filename}`;

describe('workspace avatar UUID boundary', () => {
  it('accepts only a canonical UUID workspace and ticket path', () => {
    expect(isWorkspaceAvatarPath(path(workspace), workspace)).toBe(true);
  });

  it.each([
    '',
    'personal',
    'workspace-id',
    workspace.toUpperCase(),
    `${workspace}\n`,
    `${workspace}/../victim`,
    workspace.slice(1),
  ])(
    'rejects a path even when its non-UUID workspace prefix matches: %s',
    (wsId) => {
      expect(isWorkspaceAvatarPath(path(wsId), wsId)).toBe(false);
      expect(
        ownedWorkspaceAvatarPath(
          `https://storage.test/storage/v1/object/public/avatars/${path(wsId)}`,
          wsId,
          ['https://storage.test']
        )
      ).toBeNull();
    }
  );

  it('canonicalizes only configured origins and discards invalid config', () => {
    expect(
      avatarStorageOrigins([
        undefined,
        '',
        'not a URL',
        'https://storage.test/path',
        'https://user:pass@storage.test',
        'https://storage.test?query',
        'https://storage.test#fragment',
        'ftp://storage.test',
        'https://STORAGE.TEST:443/',
        'https://storage.test',
        'http://server.test:8000',
      ])
    ).toEqual(['https://storage.test', 'http://server.test:8000']);
  });
});
