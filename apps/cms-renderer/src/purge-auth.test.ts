import { describe, expect, it } from 'vitest';
import { authorizePurge } from './purge-auth';

describe('per-site purge authorization', () => {
  const tokenA = 'a'.repeat(64);
  const tokenB = 'b'.repeat(64);
  const tokensJson = JSON.stringify({ 'site-a': tokenA, 'site-b': tokenB });
  const check = (
    header: string | null,
    siteId = 'site-a',
    tokens = tokensJson
  ) => authorizePurge({ header, siteId, tokensJson: tokens });

  it('accepts each site token only for its configured site', () => {
    expect(check(`Bearer ${tokenA}`)).toBe(true);
    expect(check(`Bearer ${tokenB}`, 'site-b')).toBe(true);
    expect(check(`Bearer ${tokenA}`, 'site-b')).toBe(false);
    expect(check(`Bearer ${tokenB}`, 'site-a')).toBe(false);
    expect(check(`Bearer ${tokenA}`, 'missing')).toBe(false);
  });
  it('rejects missing, mismatched and malformed bearer values', () => {
    for (const header of [
      null,
      '',
      tokenA,
      `Bearer ${tokenA}-extra`,
      `Bearer ${tokenA.slice(1)}`,
    ]) {
      expect(check(header)).toBe(false);
    }
  });
  it('rejects Authorization values longer than 600 characters before hashing', () => {
    expect(check(`Bearer ${'x'.repeat(594)}`)).toBe(false);
  });
  it('fails closed for absent, malformed, empty, short or shared-token configuration', () => {
    for (const tokens of [
      '',
      '{}',
      '[]',
      'null',
      '{',
      JSON.stringify({ 'site-a': '' }),
      JSON.stringify({ 'site-a': 'short' }),
      JSON.stringify({ 'site-a': tokenA, 'site-b': tokenA }),
    ]) {
      expect(check(`Bearer ${tokenA}`, 'site-a', tokens)).toBe(false);
    }
    expect(
      authorizePurge({
        header: `Bearer ${tokenA}`,
        siteId: 'site-a',
        tokensJson: undefined,
      })
    ).toBe(false);
  });
  it('supports overlap rotation, then revokes the removed token', () => {
    const overlap = JSON.stringify({ 'site-a': [tokenA, tokenB] });
    expect(check(`Bearer ${tokenA}`, 'site-a', overlap)).toBe(true);
    expect(check(`Bearer ${tokenB}`, 'site-a', overlap)).toBe(true);
    const rotated = JSON.stringify({ 'site-a': tokenB });
    expect(check(`Bearer ${tokenA}`, 'site-a', rotated)).toBe(false);
    expect(check(`Bearer ${tokenB}`, 'site-a', rotated)).toBe(true);
  });
});
