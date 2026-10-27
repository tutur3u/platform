import { describe, expect, it } from 'vitest';
import { getSupabaseCookieOptions } from '../common';

const supabase = 'https://fxefojytwimjiqxseqag.supabase.co';

describe('Drive staging cookie domain', () => {
  it('shares secure cookies only from the exact admitted Drive host', () => {
    expect(
      getSupabaseCookieOptions(supabase, 'https://drive.staging.tutur3u.com')
    ).toMatchObject({ domain: '.staging.tutur3u.com', secure: true });
    for (const origin of [
      'https://evil.drive.staging.tutur3u.com',
      'https://drive.staging.tutur3u.com.evil.test',
      'https://unlisted.staging.tutur3u.com',
    ]) {
      expect(getSupabaseCookieOptions(supabase, origin).domain).toBeUndefined();
    }
  });

  it('retains the production cookie domain', () => {
    expect(
      getSupabaseCookieOptions(supabase, 'https://drive.tuturuuu.com')
    ).toMatchObject({ domain: '.tuturuuu.com', secure: true });
  });
});
