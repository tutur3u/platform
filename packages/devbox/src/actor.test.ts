import { describe, expect, it, vi } from 'vitest';
import {
  type DevboxIdentity,
  type DevboxOperation,
  devboxRunCancelRequested,
  devboxRunnerTokenUnexpired,
  isDevboxEnvFilePath,
  requireDevboxActor,
} from './actor';

const now = Date.parse('2026-10-28T10:00:00Z');
const identity = (): DevboxIdentity => ({
  enabled: true,
  grant: {
    revoked_at: null,
    suspended: false,
    id: 'grant',
    user_id: 'user',
    status: 'active',
    accepted_at: '2026-10-28T09:00:00Z',
    expires_at: '2026-11-01T00:00:00Z',
    sessions_not_before: '2026-10-28T09:30:00Z',
    require_mfa: true,
  },
  token: {
    id: 'token',
    user_id: 'user',
    grant_id: 'grant',
    scopes: ['devbox:read', 'devbox:run'],
  },
});
describe('request-local devbox identity', () => {
  it.each<DevboxOperation>(['fleet', 'tokens', 'accept', 'devbox:build'])(
    'rejects agent operation %s before membership',
    async (operation) => {
      const root = vi.fn(async () => true);
      const result = await requireDevboxActor({
        credential: { kind: 'agent', identity: identity() },
        operation,
        isRootMember: root,
        now,
      });
      expect(result).toMatchObject({ ok: false, status: 403 });
      expect(root).not.toHaveBeenCalled();
    }
  );
  it('a valid agent owned by a root member can never yield a fleet actor', async () => {
    const root = vi.fn(async () => true);
    const result = await requireDevboxActor({
      credential: { kind: 'agent', identity: identity() },
      operation: 'devbox:run',
      isRootMember: root,
      now,
    });
    expect(result).toMatchObject({
      ok: true,
      actor: { kind: 'personal', tokenId: 'token' },
    });
    expect(root).not.toHaveBeenCalled();
  });
  it('rejects revoked/expired/unresolved tokens before membership', async () => {
    const root = vi.fn(async () => true);
    expect(
      await requireDevboxActor({
        credential: { kind: 'agent', identity: null },
        operation: 'devbox:read',
        isRootMember: root,
        now,
      })
    ).toMatchObject({ ok: false, status: 401 });
    expect(root).not.toHaveBeenCalled();
  });
  it.each(['pending', 'suspended', 'revoked'] as const)(
    'rejects %s grants',
    async (status) => {
      const value = identity();
      if (value.grant) value.grant.status = status;
      expect(
        await requireDevboxActor({
          credential: { kind: 'agent', identity: value },
          operation: 'devbox:read',
          isRootMember: async () => true,
          now,
        })
      ).toMatchObject({
        ok: false,
        code: `DEVBOX_GRANT_${status.toUpperCase()}`,
      });
    }
  );
  it.each([null, { ...identity(), enabled: false }])(
    'fails closed on disabled/missing identity',
    async (value) => {
      expect(
        await requireDevboxActor({
          credential: {
            kind: 'session',
            userId: 'user',
            issuedAt: now,
            cli: true,
            identity: value,
          },
          operation: 'tokens',
          isRootMember: async () => false,
          now,
        })
      ).toMatchObject({ ok: false });
    }
  );
  it.each(['2026-10-28T08:59:59Z', '2026-10-28T09:29:59Z'])(
    'cuts off CLI session from %s',
    async (date) => {
      expect(
        await requireDevboxActor({
          credential: {
            kind: 'session',
            userId: 'user',
            issuedAt: Date.parse(date),
            cli: true,
            identity: identity(),
          },
          operation: 'tokens',
          isRootMember: async () => false,
          now,
        })
      ).toMatchObject({ ok: false, code: 'DEVBOX_SESSION_CUTOFF' });
    }
  );
  it.each([false, true])(
    'session cutoff applies independently of CLI=%s',
    async (cli) => {
      expect(
        await requireDevboxActor({
          credential: {
            kind: 'session',
            userId: 'user',
            issuedAt: Date.parse('2026-10-28T09:00:00Z'),
            cli,
            identity: identity(),
          },
          operation: 'devbox:read',
          isRootMember: async () => false,
          now,
        })
      ).toMatchObject({ ok: false, code: 'DEVBOX_SESSION_CUTOFF' });
    }
  );
  it('suspension flag denies an otherwise active grant', async () => {
    const value = identity();
    if (value.grant) value.grant.suspended = true;
    expect(
      await requireDevboxActor({
        credential: { kind: 'agent', identity: value },
        operation: 'devbox:read',
        isRootMember: async () => false,
        now,
      })
    ).toMatchObject({ ok: false, code: 'DEVBOX_GRANT_SUSPENDED' });
  });
  it('permits a fresh session to manage its tokens', async () => {
    expect(
      await requireDevboxActor({
        credential: {
          kind: 'session',
          userId: 'user',
          issuedAt: now,
          cli: true,
          identity: identity(),
        },
        operation: 'tokens',
        isRootMember: async () => false,
        now,
      })
    ).toMatchObject({ ok: true, actor: { kind: 'personal', tokenId: null } });
  });
  it('sessions cannot submit personal work', async () => {
    expect(
      await requireDevboxActor({
        credential: {
          kind: 'session',
          userId: 'user',
          issuedAt: now,
          cli: false,
          identity: identity(),
        },
        operation: 'devbox:run',
        isRootMember: async () => false,
        now,
      })
    ).toMatchObject({ ok: false, code: 'DEVBOX_ACCESS_TOKEN_REQUIRED' });
  });
  it('uses only the bound user id, ignoring email claims', async () => {
    expect(
      await requireDevboxActor({
        credential: {
          kind: 'session',
          userId: 'forged-subject',
          issuedAt: now,
          cli: false,
          identity: identity(),
        },
        operation: 'accept',
        isRootMember: async () => false,
        now,
      })
    ).toMatchObject({ ok: false, code: 'DEVBOX_GRANT_REQUIRED' });
  });
  it('fleet sessions retain access with no grant', async () => {
    expect(
      await requireDevboxActor({
        credential: {
          kind: 'session',
          userId: 'root',
          issuedAt: null,
          cli: false,
          identity: null,
        },
        operation: 'fleet',
        isRootMember: async () => true,
        now,
      })
    ).toMatchObject({ ok: true, actor: { kind: 'fleet' } });
  });
  it('rechecks switch state across calls', async () => {
    const value = identity();
    const call = () =>
      requireDevboxActor({
        credential: { kind: 'agent', identity: value },
        operation: 'devbox:read',
        isRootMember: async () => false,
        now,
      });
    expect(await call()).toMatchObject({ ok: true });
    value.enabled = false;
    expect(await call()).toMatchObject({
      ok: false,
      code: 'DEVBOX_GRANT_DISABLED',
    });
  });
  it.each([undefined, 'bad', '2020-01-01T00:00:00Z'])(
    'runner expiry fails closed for %s',
    (expiry) => {
      expect(devboxRunnerTokenUnexpired(expiry, now)).toBe(false);
    }
  );
  it('allows nullable existing fleet expiry and future expiry', () => {
    expect(devboxRunnerTokenUnexpired(null, now)).toBe(true);
    expect(devboxRunnerTokenUnexpired('2026-10-29T00:00:00Z', now)).toBe(true);
  });
});

it.each([
  '/etc/passwd',
  'a\0b',
  'a\nb',
  '../secret',
  './/env',
  'a/../secret',
  'C:/secret',
  'a\\secret',
  'a/./env',
])('rejects unsafe env file path %s', (path) => {
  expect(isDevboxEnvFilePath(path)).toBe(false);
});
it.each(['.env', 'config/.env.local'])(
  'accepts normalized relative env path %s',
  (path) => {
    expect(isDevboxEnvFilePath(path)).toBe(true);
  }
);
it.each([401, 403])(
  'credential loss %s requests cancellation',
  async (status) => {
    expect(await devboxRunCancelRequested(new Response(null, { status }))).toBe(
      true
    );
  }
);
it('cancellation distinguishes outage and explicit requests', async () => {
  expect(
    await devboxRunCancelRequested(new Response(null, { status: 503 }))
  ).toBe(false);
  expect(
    await devboxRunCancelRequested(Response.json({ cancelRequested: true }))
  ).toBe(true);
  expect(
    await devboxRunCancelRequested(Response.json({ cancelRequested: false }))
  ).toBe(false);
});
