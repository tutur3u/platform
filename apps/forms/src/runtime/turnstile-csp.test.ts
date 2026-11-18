// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import appConfig from '../../start-bridge.config';

describe('forms Turnstile policy', () => {
  it('allows the Turnstile script under the nonce policy', () => {
    const csp = (appConfig as { csp: (nonce: string) => string }).csp('n');
    expect(csp).toContain(
      "script-src 'nonce-n' 'strict-dynamic' https://challenges.cloudflare.com"
    );
    expect(csp).toContain("object-src 'none'");
  });

  it('lets the embedded challenge escape the sandbox for popups and storage', () => {
    const embed = readFileSync(
      new URL('../../public/embed.js', import.meta.url),
      'utf8'
    );
    expect(embed).toContain('allow-popups-to-escape-sandbox');
    expect(embed).toContain('allow-storage-access-by-user-activation');
  });
});
