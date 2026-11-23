import {
  createAppCoordinationToken,
  createExternalLinkReadToken,
} from '@tuturuuu/utils/app-coordination-token';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createUpskiiReadToken,
  getUpskiiLinkStatusForProvider,
  introspectUpskiiReadToken,
  linkUpskiiAccount,
  revokeUpskiiLinkForUser,
  revokeUpskiiLinkFromProvider,
} from './link-service';
import type {
  ExternalAccountLinkRow,
  ExternalAccountLinkStore,
} from './link-store';

const SECRET = 'test-app-coordination-secret-with-enough-length';
const TUTURUUU_A = '00000000-0000-4000-8000-00000000000a';
const TUTURUUU_B = '00000000-0000-4000-8000-00000000000b';

function memoryStore() {
  const rows: ExternalAccountLinkRow[] = [];
  let sequence = 0;
  const active = (row: ExternalAccountLinkRow) => row.revoked_at === null;
  const store: ExternalAccountLinkStore = {
    findActiveBySubject: async (subject) =>
      rows.find((row) => active(row) && row.external_subject === subject) ??
      null,
    findActiveByUser: async (userId) =>
      rows.find((row) => active(row) && row.user_id === userId) ?? null,
    findById: async (id) => rows.find((row) => row.id === id) ?? null,
    hasLinkJti: async (jti) => rows.some((row) => row.link_jti === jti),
    async insert(link) {
      if (
        rows.some(
          (row) =>
            row.link_jti === link.link_jti ||
            (active(row) &&
              (row.user_id === link.user_id ||
                row.external_subject === link.external_subject))
        )
      ) {
        return null;
      }
      sequence += 1;
      const row: ExternalAccountLinkRow = {
        ...link,
        id: `00000000-0000-4000-9000-${String(sequence).padStart(12, '0')}`,
        linked_at: new Date().toISOString(),
        provider: 'upskii',
        revoked_at: null,
        revoked_by: null,
      };
      rows.push(row);
      return row;
    },
    async revoke(id, by) {
      const row = rows.find((candidate) => candidate.id === id);
      if (!row || row.revoked_at) return false;
      row.revoked_at = new Date().toISOString();
      row.revoked_by = by;
      return true;
    },
    async updateActive(id, patch) {
      const row = rows.find(
        (candidate) => candidate.id === id && active(candidate)
      );
      if (!row) throw new Error('not active');
      if (
        rows.some((other) => other !== row && other.link_jti === patch.link_jti)
      )
        return null;
      Object.assign(row, patch);
      return row;
    },
  };
  return { rows, store };
}

const ALL_SCOPES = [
  'upskii:classes:read',
  'upskii:lessons:read',
  'upskii:assessments:read',
] as const;

describe('Upskii account link', () => {
  let memory: ReturnType<typeof memoryStore>;

  beforeEach(() => {
    memory = memoryStore();
  });

  async function link(userId: string, upskiiUserId: string) {
    return linkUpskiiAccount(memory.store, {
      bearerJti: crypto.randomUUID(),
      scopes: [...ALL_SCOPES],
      upskiiEmail: `${upskiiUserId}@upskii.test`,
      upskiiUserId,
      userId,
    });
  }

  it('links once and treats the same pair as an idempotent relink', async () => {
    const first = await link(TUTURUUU_A, 'u-1');
    const second = await link(TUTURUUU_A, 'u-1');
    expect(first).toMatchObject({ created: true, ok: true });
    expect(second).toMatchObject({ created: false, ok: true });
    expect(second.ok && first.ok && second.link.id).toBe(
      first.ok && first.link.id
    );
    expect(memory.rows).toHaveLength(1);
    expect(memory.rows[0]?.scopes).toEqual([...ALL_SCOPES].sort());
  });

  it('refuses a second Upskii account for a linked Tuturuuu account', async () => {
    await link(TUTURUUU_A, 'u-1');
    expect(await link(TUTURUUU_A, 'u-2')).toEqual({
      code: 'LINK_CONFLICT',
      ok: false,
      side: 'tuturuuu',
    });
  });

  it('refuses a second Tuturuuu account for a linked Upskii account', async () => {
    await link(TUTURUUU_A, 'u-1');
    expect(await link(TUTURUUU_B, 'u-1')).toEqual({
      code: 'LINK_CONFLICT',
      ok: false,
      side: 'upskii',
    });
  });

  it('allows a new link after the user disconnects', async () => {
    await link(TUTURUUU_A, 'u-1');
    expect(
      await revokeUpskiiLinkForUser(memory.store, TUTURUUU_A)
    ).not.toBeNull();
    expect(memory.rows[0]?.revoked_by).toBe('user');
    expect(await link(TUTURUUU_A, 'u-2')).toMatchObject({ created: true });
    expect(await revokeUpskiiLinkForUser(memory.store, TUTURUUU_B)).toBeNull();
  });

  it('lets Upskii revoke only a link that belongs to its named user', async () => {
    const result = await link(TUTURUUU_A, 'u-1');
    const linkId = result.ok ? result.link.id : '';
    expect(
      await revokeUpskiiLinkFromProvider(memory.store, {
        linkId,
        upskiiUserId: 'u-2',
      })
    ).toBe('not_found');
    expect(
      await revokeUpskiiLinkFromProvider(memory.store, {
        linkId: 'not-a-uuid',
        upskiiUserId: 'u-1',
      })
    ).toBe('not_found');
    expect(memory.rows[0]?.revoked_at).toBeNull();
    expect(
      await revokeUpskiiLinkFromProvider(memory.store, {
        linkId,
        upskiiUserId: 'u-1',
      })
    ).toBe('revoked');
    expect(memory.rows[0]?.revoked_by).toBe('provider');
  });

  it('accepts each link bearer once', async () => {
    const bearerJti = crypto.randomUUID();
    const input = {
      bearerJti,
      scopes: [...ALL_SCOPES],
      upskiiEmail: null,
      upskiiUserId: 'u-1',
      userId: TUTURUUU_A,
    };
    expect(await linkUpskiiAccount(memory.store, input)).toMatchObject({
      ok: true,
    });
    expect(
      await linkUpskiiAccount(memory.store, { ...input, upskiiUserId: 'u-9' })
    ).toEqual({ code: 'LINK_BEARER_USED', ok: false });
    expect(await linkUpskiiAccount(memory.store, input)).toEqual({
      code: 'LINK_BEARER_USED',
      ok: false,
    });
  });

  it('confirms a link to Upskii only while it is active and theirs', async () => {
    const result = await link(TUTURUUU_A, 'u-1');
    const linkId = result.ok ? result.link.id : '';
    const status = (upskiiUserId: string, id = linkId) =>
      getUpskiiLinkStatusForProvider(memory.store, {
        linkId: id,
        upskiiUserId,
      });
    expect(await status('u-1')).toEqual({ active: true });
    expect(await status('u-2')).toEqual({ active: false });
    expect(await status('u-1', 'not-a-uuid')).toEqual({ active: false });
    await revokeUpskiiLinkForUser(memory.store, TUTURUUU_A);
    expect(await status('u-1')).toEqual({ active: false });
  });

  describe('read token introspection', () => {
    async function activeLink() {
      const result = await link(TUTURUUU_A, 'u-1');
      if (!result.ok) throw new Error('expected a link');
      return result.link;
    }

    it('confirms a fresh read token for an active link', async () => {
      const row = await activeLink();
      const { token } = createUpskiiReadToken(row, 'upskii:classes:read', {
        secret: SECRET,
      });
      expect(
        await introspectUpskiiReadToken(memory.store, token, { secret: SECRET })
      ).toEqual({
        active: true,
        linkId: row.id,
        scopes: ['upskii:classes:read'],
        tuturuuuUserId: TUTURUUU_A,
        upskiiUserId: 'u-1',
      });
    });

    it('stops reads as soon as either side revokes', async () => {
      const row = await activeLink();
      const { token } = createUpskiiReadToken(row, 'upskii:lessons:read', {
        secret: SECRET,
      });
      await revokeUpskiiLinkForUser(memory.store, TUTURUUU_A);
      expect(
        await introspectUpskiiReadToken(memory.store, token, { secret: SECRET })
      ).toEqual({
        active: false,
        revoked: { linkId: row.id, upskiiUserId: 'u-1' },
      });
    });

    it('refuses an expired read token', async () => {
      const row = await activeLink();
      const { token } = createUpskiiReadToken(row, 'upskii:classes:read', {
        now: new Date(Date.now() - 120_000),
        secret: SECRET,
      });
      expect(
        await introspectUpskiiReadToken(memory.store, token, { secret: SECRET })
      ).toEqual({ active: false });
    });

    it('refuses a scope the link no longer grants', async () => {
      const row = await activeLink();
      const { token } = createUpskiiReadToken(row, 'upskii:assessments:read', {
        secret: SECRET,
      });
      await linkUpskiiAccount(memory.store, {
        bearerJti: crypto.randomUUID(),
        scopes: ['upskii:classes:read'],
        upskiiEmail: null,
        upskiiUserId: 'u-1',
        userId: TUTURUUU_A,
      });
      expect(
        await introspectUpskiiReadToken(memory.store, token, { secret: SECRET })
      ).toEqual({ active: false });
      expect(() =>
        createUpskiiReadToken(memory.rows[0]!, 'upskii:assessments:read', {
          secret: SECRET,
        })
      ).toThrow();
    });

    it('never accepts an app session or bearer token as a read token', async () => {
      const row = await activeLink();
      const { token } = createAppCoordinationToken(
        {
          scopes: ['upskii:classes:read', `external-link:${row.id}`],
          targetApp: 'upskii',
          userId: TUTURUUU_A,
        },
        { secret: SECRET }
      );
      expect(
        await introspectUpskiiReadToken(memory.store, token, { secret: SECRET })
      ).toEqual({ active: false });
    });

    it("refuses a token naming another user's link", async () => {
      await activeLink();
      const other = await linkUpskiiAccount(memory.store, {
        bearerJti: crypto.randomUUID(),
        scopes: [...ALL_SCOPES],
        upskiiEmail: null,
        upskiiUserId: 'u-2',
        userId: TUTURUUU_B,
      });
      const otherId = other.ok ? other.link.id : '';
      const { token } = createExternalLinkReadToken(
        {
          scopes: ['upskii:classes:read', `external-link:${otherId}`],
          targetApp: 'upskii',
          userId: TUTURUUU_A,
        },
        { secret: SECRET }
      );
      expect(
        await introspectUpskiiReadToken(memory.store, token, { secret: SECRET })
      ).toEqual({ active: false });
    });

    it.each([
      [
        'two link scopes',
        (id: string) => [
          `external-link:${id}`,
          `external-link:${id}`,
          'upskii:classes:read',
        ],
      ],
      [
        'an unknown scope',
        (id: string) => [
          `external-link:${id}`,
          'upskii:classes:read',
          'users:profile:read',
        ],
      ],
      ['no read scope', (id: string) => [`external-link:${id}`]],
      [
        'a malformed link id',
        () => ['external-link:not-a-uuid', 'upskii:classes:read'],
      ],
    ])('refuses a token with %s', async (_label, scopes) => {
      const row = await activeLink();
      const { token } = createExternalLinkReadToken(
        { scopes: scopes(row.id), targetApp: 'upskii', userId: TUTURUUU_A },
        { secret: SECRET }
      );
      expect(
        await introspectUpskiiReadToken(memory.store, token, { secret: SECRET })
      ).toEqual({ active: false });
    });

    it('expires a read token after 60 seconds', async () => {
      const row = await activeLink();
      const issuedAt = new Date('2026-11-24T00:00:00.000Z');
      const { token } = createUpskiiReadToken(row, 'upskii:classes:read', {
        now: issuedAt,
        secret: SECRET,
      });
      const at = (seconds: number) => ({
        now: new Date(issuedAt.getTime() + seconds * 1000),
        secret: SECRET,
      });
      expect(
        (await introspectUpskiiReadToken(memory.store, token, at(59))).active
      ).toBe(true);
      expect(
        (await introspectUpskiiReadToken(memory.store, token, at(61))).active
      ).toBe(false);
    });

    it('refuses a token signed with another key', async () => {
      const row = await activeLink();
      const { token } = createUpskiiReadToken(row, 'upskii:classes:read', {
        secret: 'another-secret-with-enough-length-for-tests',
      });
      expect(
        await introspectUpskiiReadToken(memory.store, token, { secret: SECRET })
      ).toEqual({ active: false });
    });

    it('names a revoked link only for a valid token of its own user', async () => {
      const row = await activeLink();
      await revokeUpskiiLinkForUser(memory.store, TUTURUUU_A);
      const tokens = [
        createUpskiiReadToken(
          { ...row, revoked_at: null },
          'upskii:classes:read',
          { secret: 'another-secret-with-enough-length-for-tests' }
        ).token,
        createUpskiiReadToken(
          { ...row, revoked_at: null },
          'upskii:classes:read',
          {
            now: new Date(Date.now() - 120_000),
            secret: SECRET,
          }
        ).token,
        createUpskiiReadToken(
          { ...row, revoked_at: null, user_id: TUTURUUU_B },
          'upskii:classes:read',
          { secret: SECRET }
        ).token,
      ];
      for (const token of tokens) {
        const answer = await introspectUpskiiReadToken(memory.store, token, {
          secret: SECRET,
        });
        expect(answer).toEqual({ active: false });
        expect(answer).not.toHaveProperty('revoked');
      }
    });

    it('refuses a read token whose user does not own the link', async () => {
      const row = await activeLink();
      const { token } = createUpskiiReadToken(
        { ...row, user_id: TUTURUUU_B },
        'upskii:classes:read',
        { secret: SECRET }
      );
      expect(
        await introspectUpskiiReadToken(memory.store, token, { secret: SECRET })
      ).toEqual({ active: false });
    });
  });
});
