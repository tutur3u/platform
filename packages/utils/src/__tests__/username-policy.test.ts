// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
    'admin123',
    'supportteam',
    'official_admin',
    's_u_p_p_o_r_t123',
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
    'my_supportteam',
    'river123',
    'abcde',
    'a'.repeat(32),
  ])('accepts a distinct creative username %s', (value) => {
    expect(isValidNewUsername(value)).toBe(true);
  });
  it('keeps every canonical reserved name enforced in the database migration', () => {
    const sql = readFileSync(
      resolve(
        __dirname,
        '../../../../apps/database/supabase/migrations/20261004004000_public_creator_identity.sql'
      ),
      'utf8'
    );
    const seeds = [
      ...sql.matchAll(
        /jsonb_array_elements_text\('([^']+)'::jsonb\),'(common|brand)'/g
      ),
    ];
    expect(seeds).toHaveLength(2);
    for (const [category, values] of [
      ['common', reserved.common],
      ['brand', reserved.brands],
    ] as const) {
      const seed = seeds.find((match) => match[2] === category);
      expect(JSON.parse(seed![1]!)).toEqual(values);
    }
  });
});
