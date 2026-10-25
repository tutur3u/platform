import { describe, expect, it } from 'vitest';
import { cliScope, cliScopeName } from './cli-scope';

const wsId = 'f7100000-0000-0000-0000-000000000001';
const vaultId = 'f7200000-0000-0000-0000-000000000001';
describe('human CLI credential scope', () => {
  const scope = cliScopeName(wsId, vaultId);
  it('distinguishes a browser session from a short-lived vault credential', () => {
    expect(
      cliScope({ scopes: ['internal-app:session'], iat: 1, exp: 3601 })
    ).toBeNull();
    expect(
      cliScope({ scopes: ['internal-app:session', scope], iat: 1, exp: 301 })
    ).toEqual({ wsId, vaultId });
  });
  it('refuses multiple scopes, malformed identities and excess lifetime', () => {
    for (const claims of [
      { scopes: [scope, scope], iat: 1, exp: 301 },
      { scopes: ['passwords:cli:other'], iat: 1, exp: 301 },
      { scopes: [scope], iat: 1, exp: 902 },
    ])
      expect(() => cliScope(claims)).toThrow();
  });
});
