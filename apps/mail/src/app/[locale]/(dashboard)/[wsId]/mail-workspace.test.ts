import { describe, expect, it } from 'vitest';
import { DEFAULT_MAIL_FOLDER, getMailFolderHref } from './mail-folders';
import { getMailFolderFromPathname } from './mail-workspace-path';

describe('getMailFolderHref', () => {
  it('uses the canonical inbox route after a workspace invitation is accepted', () => {
    expect(getMailFolderHref('workspace-alpha', DEFAULT_MAIL_FOLDER)).toBe(
      '/workspace-alpha/inbox'
    );
  });
});

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
