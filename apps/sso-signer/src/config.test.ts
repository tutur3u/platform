import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vite-plus/test';
import { PRODUCTION_DEFINES } from './build-defines';

// The signer has no public ingress: every caller arrives through a service
// binding to a named entry point, and the shipped config signs nothing.
const config = readFileSync(
  new URL('../cloudflare.config.ts', import.meta.url),
  'utf8'
);
const code = config
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n');

describe('signer Worker config', () => {
  it('keeps workers.dev and preview URLs off', () => {
    expect(code).toMatch(/workersDev:\s*false/u);
    expect(code).toMatch(/previewUrls:\s*false/u);
  });

  it('declares no routes or custom domains', () => {
    expect(code).not.toMatch(/\broutes?\b|customDomains?|\bdomains?\s*:/u);
  });

  it('ships no environment name, kid map, permit key or transaction check', () => {
    expect(code).not.toMatch(/'local'/u);
    for (const name of [
      'SSO_SIGNER_ENV',
      'SSO_SIGNER_KEYS',
      'SSO_SIGNER_PERMIT_PUBLIC_KEY',
      'SSO_SIGNER_TRANSACTION_CHECK',
      'SSO_SIGNER_FENCE_FLOOR',
    ]) {
      expect(code).toMatch(
        new RegExp(`${name}:\\s*bindings\\.text\\(''\\)`, 'u')
      );
    }
  });

  it('builds the deployed Worker with the unchecked path compiled out', () => {
    const vite = readFileSync(
      new URL('../vite.config.ts', import.meta.url),
      'utf8'
    );
    expect(vite).toMatch(/define:\s*\{\s*\.\.\.PRODUCTION_DEFINES\s*\}/u);
    expect(PRODUCTION_DEFINES).toEqual({ __SSO_SIGNER_UNCHECKED__: 'false' });
  });

  it('provisions no signing key secret and runs under nodejs_compat', () => {
    expect(code).not.toMatch(/SSO_SIGNING_KEY_/u);
    expect(code).toMatch(/compatibilityFlags:\s*\['nodejs_compat'\]/u);
  });

  it('keeps every Durable Object on SQLite storage', () => {
    expect(
      code.match(/exports\.durableObject\(\{ storage: 'sqlite' \}\)/gu)
    ).toHaveLength(3);
  });
});
