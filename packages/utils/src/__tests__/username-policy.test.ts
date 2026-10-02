// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isReservedUsername, isValidNewUsername } from '../username-policy';
import reserved from '../username-policy.json';

describe('Canonical username policy', () => {
  it.each([
    'four',
    'abc',
    '_invalid',
    'Uppercase',
    'has-hyphen',
    'a'.repeat(33),
  ])('rejects invalid new usernames %s', (value) => {
    expect(isValidNewUsername(value)).toBe(false);
  });
  it.each([
    'apple',
    'google',
    'microsoft',
    'support',
    'admin',
    'g_o_o_g_l_e',
    'apple123',
    'official_microsoft',
    'google_support',
  ])('reserves common and branded identities %s', (value) => {
    expect(isReservedUsername(value)).toBe(true);
    expect(isValidNewUsername(value)).toBe(false);
  });
  it.each([
    'quiet_artist',
    'my_world',
    'pineapple',
    'river123',
    'abcde',
    'a'.repeat(32),
  ])('accepts a distinct creative username %s', (value) => {
    expect(isValidNewUsername(value)).toBe(true);
  });
  it('keeps every canonical reserved name enforced in the database migration', () => {
    const sql = readFileSync(
      new URL(
        '../../../../apps/database/supabase/migrations/20261002164500_public_creator_identity.sql',
        import.meta.url
      ),
      'utf8'
    );
    for (const value of [...reserved.common, ...reserved.brands])
      expect(sql).toContain(`"${value}"`);
  });
});
