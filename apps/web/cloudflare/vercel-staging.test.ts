// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stagingProfile } from './profile';

// Resolved from this file so both the candidate and the app Vitest roots work.
const appRoot = resolve(__dirname, '..');
const text = (name: string) => readFileSync(resolve(appRoot, name), 'utf8');
const read = (name: string) => JSON.parse(text(name));
const production = read('vercel.json');
const staging = read('vercel.staging.json');

describe('staging-only Vercel config for the staging Next fallback', () => {
  it('attests the staging Supabase project on every response', () => {
    expect(staging.headers).toEqual([
      {
        source: '/(.*)',
        headers: [
          {
            key: stagingProfile.upstreamProjectHeader,
            value: stagingProfile.supabaseRef,
          },
        ],
      },
    ]);
  });

  it('runs no crons and otherwise matches the production build exactly', () => {
    expect(staging.crons).toEqual([]);
    const { crons: _c, headers: _h, ...stagingRest } = staging;
    const { crons: _pc, ...productionRest } = production;
    expect(stagingRest).toEqual(productionRest);
    expect(staging.git).toEqual({ deploymentEnabled: false });
  });

  it('leaves the production config byte-free of staging identity', () => {
    const text = readFileSync(
      new URL('../vercel.json', import.meta.url),
      'utf8'
    );
    expect(text).not.toContain(stagingProfile.supabaseRef);
    expect(text).not.toContain(stagingProfile.upstreamProjectHeader);
    expect(text).not.toContain('staging.tutur3u.com');
    expect(production.crons.length).toBeGreaterThan(0);
  });
});
