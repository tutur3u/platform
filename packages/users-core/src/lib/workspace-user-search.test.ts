import { describe, expect, it } from 'vitest';
import {
  buildWorkspaceUserSearchValue,
  matchesWorkspaceUserSearch,
  normalizeWorkspaceUserSearchText,
} from './workspace-user-search';

describe('workspace-user-search', () => {
  it('normalizes accents, whitespace, and vietnamese d variants', () => {
    expect(normalizeWorkspaceUserSearchText('  Đặng   Thị  Duyên  ')).toBe(
      'dang thi duyen'
    );
  });

  it('matches tokens in order across workspace user search fields', () => {
    expect(
      matchesWorkspaceUserSearch(
        {
          full_name: 'Nguyen Van A',
          email: 'vana@example.com',
        },
        'nguyen example'
      )
    ).toBe(true);

    expect(
      matchesWorkspaceUserSearch(
        {
          full_name: 'Nguyen Van A',
          email: 'vana@example.com',
        },
        'example nguyen'
      )
    ).toBe(false);
  });

  it('builds a search value that supports raw and normalized combobox matching', () => {
    expect(
      buildWorkspaceUserSearchValue({
        full_name: 'Dương Anh',
        email: 'duong@example.com',
      })
    ).toContain('duong anh duong@example.com');
  });
});
