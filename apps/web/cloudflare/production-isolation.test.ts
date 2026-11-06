// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { stagingProfile } from './profile';

describe('production Web configuration remains isolated', () => {
  it('retains production crons and no staging identity', () => {
    const text = readFileSync(
      new URL('../vercel.json', import.meta.url),
      'utf8'
    );
    expect(text).not.toContain(stagingProfile.supabaseRef);
    expect(text).not.toContain(stagingProfile.upstreamProjectHeader);
    expect(text).not.toContain('staging.tutur3u.com');
    expect(JSON.parse(text).crons.length).toBeGreaterThan(0);
  });
});
