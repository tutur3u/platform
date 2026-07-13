import { describe, expect, it } from 'vitest';
import { getMailFolderFromPathname } from './mail-workspace-path';

describe('getMailFolderFromPathname', () => {
  it('resolves system folders from localized workspace routes', () => {
    expect(getMailFolderFromPathname('/en/personal/inbox')).toBe('inbox');
    expect(getMailFolderFromPathname('/personal/archive')).toBe('archive');
  });

  it('leaves non-folder routes to their page content', () => {
    expect(getMailFolderFromPathname('/personal')).toBeNull();
    expect(getMailFolderFromPathname('/personal/settings')).toBeNull();
  });
});
