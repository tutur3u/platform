import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = {
  id: string;
  user_id: string;
  ws_id: string;
  provider: string;
  revision: number;
  credentials: string;
};
const db = vi.hoisted(() => ({
  rows: [] as Row[],
  deletes: [] as [string, unknown][][],
  deleteError: null as unknown,
}));

// A minimal in-memory query builder for private.mail_connected_accounts that
// applies eq filters, so deletes and fenced reads act on real row state.
function builder() {
  let op: 'select' | 'update' | 'delete' = 'select';
  let patch: Partial<Row> = {};
  const filters: [string, unknown][] = [];
  const matches = (row: Row) =>
    filters.every(([key, value]) => row[key as keyof Row] === value);
  const chain = {
    select: () => chain,
    update: (values: Partial<Row>) => {
      op = 'update';
      patch = values;
      return chain;
    },
    delete: () => {
      op = 'delete';
      return chain;
    },
    eq: (key: string, value: unknown) => {
      filters.push([key, value]);
      return chain;
    },
    maybeSingle: async () => {
      const found = db.rows.filter(matches);
      if (op === 'delete') {
        db.deletes.push([...filters]);
        if (db.deleteError) return { data: null, error: db.deleteError };
        db.rows = db.rows.filter((row) => !matches(row));
      }
      if (op === 'update') for (const row of found) Object.assign(row, patch);
      return { data: found[0] ?? null, error: null };
    },
  };
  return chain;
}
vi.mock('../repository/shared', () => ({
  getAdminClient: async () => ({ schema: () => ({ from: () => builder() }) }),
}));

import { seal } from './crypto';
import {
  isRevokedGrant,
  MICROSOFT_REVOKED_GRANT_CODES,
  RevokedGrantError,
} from './grant-revocation';
import { accessToken, type ConnectedAccount } from './repository';

const refreshSecret = 'synthetic-refresh-secret';
const accessSecret = 'synthetic-access-secret';
const bodySecret = 'synthetic-body-secret';
let warn: ReturnType<typeof vi.spyOn>;

function row(
  id: string,
  provider: 'google' | 'microsoft' = 'google',
  overrides: Partial<Row> = {}
): Row {
  return {
    id,
    user_id: 'owner',
    ws_id: 'workspace',
    provider,
    revision: 5,
    credentials: seal(
      { accessToken: accessSecret, refreshToken: refreshSecret, expiresAt: 0 },
      'owner'
    ),
    ...overrides,
  };
}
const snapshot = (value: Row) =>
  ({ ...value, address: 'synthetic@example.test' }) as ConnectedAccount;
const tokenError = (status: number, body: unknown) =>
  vi
    .fn()
    .mockImplementation(
      async () => new Response(JSON.stringify(body), { status })
    );
const googleRevoked = {
  error: 'invalid_grant',
  error_description: `Token has been expired or revoked. ${bodySecret}`,
};
const microsoftRevoked = {
  error: 'invalid_grant',
  error_description: `AADSTS70008: The refresh token has expired. ${bodySecret}`,
  error_codes: [70008],
};

beforeEach(() => {
  db.rows = [];
  db.deletes = [];
  db.deleteError = null;
  vi.stubEnv('MAIL_CONNECTED_ACCOUNTS_KEY', 'a'.repeat(64));
  for (const prefix of ['GOOGLE', 'MICROSOFT']) {
    vi.stubEnv(`MAIL_${prefix}_CLIENT_ID`, 'id');
    vi.stubEnv(`MAIL_${prefix}_CLIENT_SECRET`, 'synthetic');
    vi.stubEnv(
      `MAIL_${prefix}_REDIRECT_URI`,
      'https://mail.example.test/callback'
    );
  }
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('revoked grant classification', () => {
  it('treats only a 400 Google invalid_grant as revoked', () => {
    expect(isRevokedGrant('google', 400, googleRevoked)).toBe(true);
    for (const [status, body] of [
      [500, googleRevoked],
      [429, googleRevoked],
      [401, googleRevoked],
      [400, { error: 'invalid_client' }],
      [400, { error: 'invalid_request' }],
      [400, { error: 'unauthorized_client' }],
      [400, null],
      [400, 'invalid_grant'],
      [400, { error: 'invalid_grant', error_subtype: 'invalid_rapt' }],
      [
        400,
        {
          error: 'invalid_grant',
          error_description: 'reauth related error (invalid_rapt)',
        },
      ],
    ] as const)
      expect(isRevokedGrant('google', status, body)).toBe(false);
  });
  it.each([...MICROSOFT_REVOKED_GRANT_CODES])(
    'treats Microsoft invalid_grant AADSTS%s as revoked',
    (code) => {
      expect(
        isRevokedGrant('microsoft', 400, {
          error: 'invalid_grant',
          error_codes: [code],
        })
      ).toBe(true);
      expect(
        isRevokedGrant('microsoft', 400, {
          error: 'invalid_grant',
          error_description: `AADSTS${code}: synthetic`,
        })
      ).toBe(true);
    }
  );
  it.each([
    ['MFA required', { error: 'invalid_grant', error_codes: [50076] }],
    ['Conditional Access', { error: 'invalid_grant', error_codes: [53003] }],
    ['password expired', { error: 'invalid_grant', error_codes: [50133] }],
    ['disabled account', { error: 'invalid_grant', error_codes: [50057] }],
    ['no code', { error: 'invalid_grant' }],
    [
      'withdrawn consent (65001)',
      {
        error: 'invalid_grant',
        error_codes: [65001],
        suberror: 'consent_required',
      },
    ],
    [
      'an interaction suberror on a revoked code',
      {
        error: 'invalid_grant',
        error_codes: [70008],
        suberror: 'interaction_required',
      },
    ],
    [
      'unconsented scopes (70000)',
      {
        error: 'invalid_grant',
        error_codes: [70000],
        error_description:
          'AADSTS70000: The request was denied because one or more scopes requested are unauthorized or expired.',
      },
    ],
    [
      'a revoked code alongside an MFA code',
      { error: 'invalid_grant', error_codes: [70008, 50076] },
    ],
    [
      'listed codes overriding a revoked code in the description',
      {
        error: 'invalid_grant',
        error_codes: [50076],
        error_description: 'AADSTS70008: synthetic',
      },
    ],
    ['bad secret', { error: 'invalid_client', error_codes: [7000215] }],
    [
      'revoked code on another error',
      { error: 'invalid_client', error_codes: [70008] },
    ],
  ])('keeps Microsoft credentials for %s', (_, body) => {
    expect(isRevokedGrant('microsoft', 400, body)).toBe(false);
  });
  it('accepts a dead-token suberror on a revoked Microsoft code', () => {
    expect(
      isRevokedGrant('microsoft', 400, {
        error: 'invalid_grant',
        error_codes: [70000],
        suberror: 'bad_token',
      })
    ).toBe(true);
  });
  it('keeps Microsoft credentials for a revoked code outside HTTP 400', () => {
    expect(isRevokedGrant('microsoft', 503, microsoftRevoked)).toBe(false);
  });
});

describe('refresh with a revoked grant', () => {
  it.each([
    ['google', googleRevoked],
    ['microsoft', microsoftRevoked],
  ] as const)(
    'deletes only the %s account row with the disconnect predicate and revision',
    async (provider, body) => {
      const target = row('target', provider);
      const sibling = row('sibling', provider);
      const otherWorkspace = row('target', provider, { ws_id: 'elsewhere' });
      const otherUser = row('target', provider, { user_id: 'someone' });
      db.rows = [target, sibling, otherWorkspace, otherUser];
      vi.stubGlobal('fetch', tokenError(400, body));

      const error = await accessToken(snapshot(target)).catch((e) => e);
      expect(error).toBeInstanceOf(RevokedGrantError);
      expect(error).toMatchObject({
        status: 409,
        message: 'Mail account access was revoked; reconnect it',
      });
      expect(db.deletes).toEqual([
        [
          ['id', 'target'],
          ['user_id', 'owner'],
          ['ws_id', 'workspace'],
          ['revision', 5],
        ],
      ]);
      expect(db.rows).toEqual([sibling, otherWorkspace, otherUser]);
      expect(warn).toHaveBeenCalledWith(
        'Mail removed a connected account whose grant was revoked',
        { accountId: 'target', provider }
      );
    }
  );
  it.each([
    ['network error', () => vi.fn().mockRejectedValue(new TypeError('fetch'))],
    [
      'timeout',
      () => vi.fn().mockRejectedValue(new DOMException('', 'TimeoutError')),
    ],
    ['5xx', () => tokenError(503, googleRevoked)],
    ['rate limit', () => tokenError(429, googleRevoked)],
    ['invalid_client', () => tokenError(401, { error: 'invalid_client' })],
    ['invalid_request', () => tokenError(400, { error: 'invalid_request' })],
    [
      'unparsable body',
      () => vi.fn().mockResolvedValue(new Response('<html>', { status: 400 })),
    ],
  ])('keeps the row on a %s', async (_, fetch) => {
    const target = row('target');
    db.rows = [target];
    vi.stubGlobal('fetch', fetch());
    const error = await accessToken(snapshot(target)).catch((e) => e);
    expect(error).not.toBeInstanceOf(RevokedGrantError);
    expect(db.deletes).toEqual([]);
    expect(db.rows).toEqual([target]);
  });
  it('never deletes on a sign-in code exchange invalid_grant', async () => {
    const { exchangeToken } = await import('./repository');
    vi.stubGlobal('fetch', tokenError(400, googleRevoked));
    const error = await exchangeToken('google', {
      grant_type: 'authorization_code',
      code: 'synthetic',
    }).catch((e) => e);
    expect(error).not.toBeInstanceOf(RevokedGrantError);
    expect(error).toMatchObject({
      status: 409,
      message: 'Reconnect this mail account',
    });
    expect(db.deletes).toEqual([]);
  });
  it('keeps Google credentials when Workspace asks for re-authentication', async () => {
    const target = row('target');
    db.rows = [target];
    vi.stubGlobal(
      'fetch',
      tokenError(400, { error: 'invalid_grant', error_subtype: 'invalid_rapt' })
    );
    await expect(accessToken(snapshot(target))).rejects.toMatchObject({
      message: 'Reconnect this mail account',
    });
    expect(db.rows).toEqual([target]);
  });
  it('keeps Microsoft credentials when the grant needs interaction', async () => {
    const target = row('target', 'microsoft');
    db.rows = [target];
    vi.stubGlobal(
      'fetch',
      tokenError(400, { error: 'invalid_grant', error_codes: [50076] })
    );
    await expect(accessToken(snapshot(target))).rejects.toMatchObject({
      status: 409,
      message: 'Reconnect this mail account',
    });
    expect(db.rows).toEqual([target]);
  });
  it('adopts a concurrent successful refresh instead of deleting it', async () => {
    const stale = snapshot(row('target'));
    const winner = row('target', 'google', {
      revision: 6,
      credentials: seal(
        {
          accessToken: 'winner',
          refreshToken: 'rotated',
          expiresAt: Date.now() + 3600000,
        },
        'owner'
      ),
    });
    db.rows = [winner];
    vi.stubGlobal('fetch', tokenError(400, googleRevoked));
    expect(await accessToken(stale)).toBe('winner');
    expect(db.deletes).toHaveLength(1);
    expect(db.rows).toEqual([winner]);
    expect(stale.revision).toBe(6);
    expect(warn).not.toHaveBeenCalled();
  });
  it('keeps a newer row it cannot adopt and reports a conflict', async () => {
    const stale = snapshot(row('target'));
    const newer = row('target', 'google', { revision: 9 });
    db.rows = [newer];
    vi.stubGlobal('fetch', tokenError(400, googleRevoked));
    await expect(accessToken(stale)).rejects.toMatchObject({
      status: 409,
      message: 'Mail credentials changed; reload this account',
    });
    expect(db.rows).toEqual([newer]);
  });
  it('treats a repeated or concurrent deletion as a no-op', async () => {
    const target = row('target');
    db.rows = [target];
    const fetch = tokenError(400, googleRevoked);
    vi.stubGlobal('fetch', fetch);
    const first = snapshot(target);
    const second = snapshot(target);
    const results = await Promise.allSettled([
      accessToken(first),
      accessToken(second),
    ]);
    for (const result of results)
      expect(result).toMatchObject({
        status: 'rejected',
        reason: expect.any(RevokedGrantError),
      });
    // Concurrent refreshes in one instance share a single provider call and delete.
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(db.deletes).toHaveLength(1);
    // A later caller holding the deleted snapshot gets the same typed error.
    await expect(accessToken(snapshot(target))).rejects.toBeInstanceOf(
      RevokedGrantError
    );
    expect(db.deletes).toHaveLength(2);
    expect(db.rows).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
  });
  it('reports a failed delete without leaking credentials', async () => {
    const target = row('target', 'microsoft');
    db.rows = [target];
    db.deleteError = { message: 'synthetic' };
    vi.stubGlobal('fetch', tokenError(400, microsoftRevoked));
    await expect(accessToken(snapshot(target))).rejects.toBeInstanceOf(
      RevokedGrantError
    );
    expect(warn).toHaveBeenCalledWith(
      'Mail could not remove a revoked connected account',
      { accountId: 'target', provider: 'microsoft' }
    );
  });
  it('never logs tokens or the provider response body', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const [provider, body] of [
      ['google', googleRevoked],
      ['microsoft', microsoftRevoked],
    ] as const) {
      const target = row(`target-${provider}`, provider);
      db.rows = [target];
      vi.stubGlobal('fetch', tokenError(400, body));
      await accessToken(snapshot(target)).catch(() => undefined);
    }
    const logged = JSON.stringify([
      warn.mock.calls,
      log.mock.calls,
      error.mock.calls,
    ]);
    expect(warn).toHaveBeenCalledTimes(2);
    for (const secret of [
      refreshSecret,
      accessSecret,
      bodySecret,
      'invalid_grant',
      'AADSTS',
    ])
      expect(logged).not.toContain(secret);
  });
});
