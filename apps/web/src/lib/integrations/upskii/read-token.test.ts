import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ExternalAccountLinkRow,
  ExternalAccountLinkStore,
} from './link-store';

const mocks = vi.hoisted(() => ({ canLink: vi.fn(async () => true) }));
vi.mock('./access', () => ({ canUserLinkUpskii: mocks.canLink }));

const { mintUpskiiReadTokenForUser } = await import('./read-token');

const LINK: ExternalAccountLinkRow = {
  external_email: null,
  external_subject: 'u-1',
  id: '00000000-0000-4000-9000-000000000001',
  linked_at: '2026-11-24T00:00:00.000Z',
  provider: 'upskii',
  revoked_at: null,
  revoked_by: null,
  scopes: ['upskii:classes:read'],
  user_id: 'user-1',
};

function store(link: ExternalAccountLinkRow | null) {
  return {
    findActiveByUser: vi.fn(async () => link),
  } as unknown as ExternalAccountLinkStore;
}

describe('mintUpskiiReadTokenForUser', () => {
  beforeEach(() => {
    mocks.canLink.mockResolvedValue(true);
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');
  });

  const mint = (
    link: ExternalAccountLinkRow | null,
    scope = 'upskii:classes:read' as const
  ) =>
    mintUpskiiReadTokenForUser({
      admin: {} as never,
      scope,
      store: store(link),
      userId: 'user-1',
    });

  it("mints for the session user's own active link", async () => {
    expect(await mint(LINK)).toMatchObject({
      linkId: LINK.id,
      ok: true,
      upskiiUserId: 'u-1',
    });
  });

  it('answers NOT_LINKED without a link', async () => {
    expect(await mint(null)).toEqual({ code: 'NOT_LINKED', ok: false });
  });

  it('re-checks the early-access gate at mint time', async () => {
    mocks.canLink.mockResolvedValue(false);
    expect(await mint(LINK)).toEqual({ code: 'EARLY_ACCESS_ONLY', ok: false });
  });

  it('refuses a scope the link does not grant', async () => {
    expect(
      await mintUpskiiReadTokenForUser({
        admin: {} as never,
        scope: 'upskii:assessments:read',
        store: store(LINK),
        userId: 'user-1',
      })
    ).toEqual({ code: 'SCOPE_NOT_GRANTED', ok: false });
  });
});
