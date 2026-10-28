// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { stagingProfile } from './profile';

describe('dormant Contacts profile', () => {
  it('cannot publish or serve assets outside the gate', () => {
    const source = readFileSync(
      new URL('./void.config.ts', import.meta.url),
      'utf8'
    );
    expect(source).toContain("CONTACTS_START_CANDIDATE: 'off'");
    expect(source).toContain('workers_dev: false');
    expect(source).toContain('preview_urls: false');
    expect(source).toContain('run_worker_first: true');
    expect(source).toContain("not_found_handling: 'none'");
    expect(source).not.toMatch(
      /\b(?:routes|queues|durable_objects|triggers|d1_databases|r2_buckets)\s*:/u
    );
    expect(stagingProfile.host).toBe('contacts.staging.tutur3u.com');
  });
  it('has no usable upstream or credential in the template', () => {
    const source = readFileSync(
      new URL('./staging.env.example', import.meta.url),
      'utf8'
    );
    expect(source).toContain('CONTACTS_START_CANDIDATE=off');
    expect(source).toContain(
      'NEXT_FALLBACK_ORIGIN=<owner-verified-immutable-staging-next-origin>'
    );
    expect(source).not.toMatch(/^\w*(?:SECRET|TOKEN|PASSWORD|KEY)=/mu);
  });
});
