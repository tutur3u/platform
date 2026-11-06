import type { Session } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { isAzureSessionTenantAllowed } from './azure-tenant';

const tenant = '11111111-1111-1111-1111-111111111111';
const foreign = '22222222-2222-2222-2222-222222222222';

function session(identityData: Record<string, unknown>): Session {
  const payload = Buffer.from(
    JSON.stringify({ amr: [{ method: 'oauth' }] })
  ).toString('base64url');
  return {
    access_token: `e30.${payload}.signature`,
    refresh_token: 'test',
    token_type: 'bearer',
    expires_in: 3600,
    user: {
      id: 'test',
      aud: 'authenticated',
      created_at: '2026-01-01',
      app_metadata: { provider: 'azure' },
      user_metadata: {},
      identities: [
        {
          id: 'test',
          identity_id: 'test',
          user_id: 'test',
          created_at: '2026-01-01',
          provider: 'azure',
          identity_data: identityData,
        },
      ],
    },
  };
}

describe('Azure tenant identity claims', () => {
  it.each([
    [{ tid: tenant }, true],
    [{ custom_claims: { tid: tenant } }, true],
    [{ iss: `https://login.microsoftonline.com/${tenant}/v2.0` }, true],
    [
      { tid: tenant, iss: `https://login.microsoftonline.com/${foreign}/v2.0` },
      false,
    ],
    [{ tid: 'common' }, false],
    [{}, false],
  ] satisfies Array<[Record<string, unknown>, boolean]>)(
    'validates %j',
    (data, allowed) => {
      expect(isAzureSessionTenantAllowed(session(data), tenant)).toBe(allowed);
    }
  );
});
