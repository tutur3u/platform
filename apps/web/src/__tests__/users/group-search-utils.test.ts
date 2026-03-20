import { describe, expect, it } from 'vitest';
import {
  matchesUserGroupSearch,
  normalizeUserGroupSearchText,
} from '@/app/[locale]/(dashboard)/[wsId]/users/groups/utils';

describe('group search utils', () => {
  it('normalizes Vietnamese accents and whitespace', () => {
    expect(normalizeUserGroupSearchText('  Nhóm   Đặc Biệt  ')).toBe(
      'nhom dac biet'
    );
  });

  it('matches unaccented Vietnamese queries against accented group names', () => {
    expect(matchesUserGroupSearch('Nhóm Đặc Biệt', 'nhom dac')).toBe(true);
    expect(matchesUserGroupSearch('Lớp Đường Tăng', 'duong tang')).toBe(true);
  });

  it('requires every query term to be present', () => {
    expect(matchesUserGroupSearch('Nhóm Đặc Biệt', 'nhom biet')).toBe(true);
    expect(matchesUserGroupSearch('Nhóm Đặc Biệt', 'nhom tre')).toBe(false);
  });
});
