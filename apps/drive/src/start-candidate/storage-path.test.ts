// @vitest-environment node
import {
  filterDriveEntries,
  isExcludedDrivePath,
} from '@tuturuuu/storage-core/drive-path-policy';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { sanitizePath } from '@tuturuuu/utils/storage-path';
import { describe, expect, it } from 'vitest';

describe('Drive candidate keeps the central storage path guard', () => {
  it.each([
    '../other-workspace/file',
    'documents/%252e%252e/private',
    'documents/%2fprivate',
    'chat/thread/file',
    '%2563hats/thread/file',
    'external-apps/app/file',
    'AI%20Agent%20Imports/file',
    'mira/images/file',
    'recordings/meeting/file',
    'topic-announcements/attachments/file',
  ])('excludes private or unsafe path %s', (path) => {
    expect(isExcludedDrivePath('workspace-a', path)).toBe(true);
  });

  it('keeps the internal workspace deployment namespace reserved', () => {
    expect(
      isExcludedDrivePath(
        ROOT_WORKSPACE_ID,
        '.tuturuuu/mobile-deployment-vault/file'
      )
    ).toBe(true);
  });

  it('keeps ordinary bilingual filenames and nested user folders', () => {
    for (const path of ['', 'documents/Báo cáo.pdf', 'documents/chat/file']) {
      expect(sanitizePath(path)).toBe(path);
      expect(isExcludedDrivePath('workspace-a', path)).toBe(false);
    }
    expect(
      filterDriveEntries('workspace-a', '', [
        { name: 'documents' },
        { name: 'chats' },
        { name: 'recordings' },
        { name: 'mira' },
      ])
    ).toEqual([{ name: 'documents' }, { name: 'mira' }]);
  });
});
