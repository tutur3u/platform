import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vite-plus/test';

// The auth Worker has no public ingress: every caller arrives through a
// service binding to a named entry point.
const config = readFileSync(
  new URL('../cloudflare.config.ts', import.meta.url),
  'utf8'
);
const code = config
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n');

describe('auth Worker config', () => {
  it('keeps workers.dev and preview URLs off', () => {
    expect(code).toMatch(/workersDev:\s*false/u);
    expect(code).toMatch(/previewUrls:\s*false/u);
  });

  it('declares no routes or custom domains', () => {
    expect(code).not.toMatch(/\broutes?\b|customDomains?|\bdomains?\s*:/u);
  });

  it('ships with the environment set to local', () => {
    expect(code).toMatch(/TTR_SESSION_ENV:\s*bindings\.text\('local'\)/u);
  });
});
