import { describe, expect, it } from 'vitest';
import { filterDriveEntries, isExcludedDrivePath } from './drive-path-policy';

describe('Drive excludes private chat namespaces', () => {
  it.each([
    'external-apps/example/chat/conversation/attachment/file.pdf',
    'chats',
    'chats/ai',
    'chats/ai/resources/chat-a/quarantined.html',
    'chats/conversation-a/file.pdf',
    'chats/ai/resources/temp/member-a/file.pdf',
    '%63hats/ai/resources/chat-a/file.pdf',
    '%2563hats/ai/resources/chat-a/file.pdf',
    'chats\\ai\\resources\\chat-a\\file.pdf',
  ])('blocks %s in every workspace', (path) => {
    expect(isExcludedDrivePath('ws-1', path)).toBe(true);
  });

  it('keeps ordinary Drive names and nested chats folders', () => {
    for (const path of [
      '',
      'documents/file.pdf',
      'documents/chats/file.txt',
      'chats-backup/file.pdf',
    ]) {
      expect(isExcludedDrivePath('ws-1', path)).toBe(false);
    }
  });

  it('hides chat folders from root listings', () => {
    expect(
      filterDriveEntries('ws-1', '', [
        { name: 'chats' },
        { name: '%63hats' },
        { name: 'documents' },
      ])
    ).toEqual([{ name: 'documents' }]);
    expect(
      filterDriveEntries('ws-1', 'documents', [{ name: 'chats' }])
    ).toEqual([{ name: 'chats' }]);
  });
});
