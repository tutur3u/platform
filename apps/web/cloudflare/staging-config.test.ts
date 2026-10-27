import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { admittedOrigin, stagingProfile } from './profile';
import config from './void.config';

describe('dormant web staging configuration', () => {
  it('has no public ingress, schedules or external bindings and defaults both gates off', () => {
    expect(config.cloudflare).toMatchObject({
      workers_dev: false,
      preview_urls: false,
      vars: { WEB_START_CANDIDATE: 'off', WEB_START_NATIVE_LEGAL: 'off' },
    });
    expect(config.cloudflare).not.toHaveProperty('routes');
    expect(config.cloudflare).not.toHaveProperty('triggers');
    expect(config.cloudflare).not.toHaveProperty('r2_buckets');
  });
  it('cannot admit the placeholder-only owner template', () => {
    const template = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), 'staging.env.example'),
      'utf8'
    );
    expect(template).toContain('WEB_START_CANDIDATE=off');
    expect(template).toContain('WEB_START_NATIVE_LEGAL=off');
    expect(
      admittedOrigin(
        new Request('https://' + stagingProfile.host + '/privacy'),
        {
          WEB_START_CANDIDATE: 'off',
          NEXT_PUBLIC_SUPABASE_URL: '<owner-verified-staging-supabase-url>',
        }
      )
    ).toBeNull();
  });
});
