import { describe, expect, it, vi } from 'vitest';

vi.mock('./workspace-members', () => ({
  loadExternalAppWorkspaceMembers: vi.fn(),
}));

import {
  buildMemberListV2Snapshot,
  type MembershipRow,
  membershipRevision,
  paginateMemberListV2,
  parseMemberListRequest,
  scanWorkspaceMemberships,
} from './workspace-member-list-v2';

const WS = '33333333-3333-4333-8333-333333333333';

function v1Member(id: string, role: 'admin' | 'member' = 'member') {
  return {
    avatarUrl: null,
    displayName: id,
    email: `${id}@example.com`,
    id,
    isCreator: false,
    isCurrentUser: id === 'user-a',
    role,
    roleSources: role === 'admin' ? (['role'] as const) : ([] as const),
  };
}

function row(
  user_id: string,
  created_at = '2026-11-01T00:00:00.000000+00:00',
  type: MembershipRow['type'] = 'MEMBER'
): MembershipRow {
  return { created_at, type, user_id };
}

function snapshot({
  members = ['user-a', 'user-b', 'user-c'],
  rows = members.map((id) => row(id)),
  extraV1 = [] as string[],
  invitations = [] as Array<{ createdAt: string | null; email: string | null }>,
  exhaustive = true,
  rowCount = 10 as number | null,
} = {}) {
  return buildMemberListV2Snapshot({
    memberships: { exhaustive, rows },
    rowCount,
    v1: {
      context: {
        canManageMembers: true,
        canManageRoles: true,
        defaultAdminEnabled: false,
      },
      invitations,
      members: [...members, ...extraV1].map((id) =>
        v1Member(id)
      ) as unknown as Parameters<
        typeof buildMemberListV2Snapshot
      >[0]['v1']['members'],
    },
    wsId: WS,
  });
}

function v2(query = '') {
  const parsed = parseMemberListRequest(
    new Request(`http://localhost/members?version=2${query}`)
  );
  if (!('version' in parsed) || parsed.version !== 2) {
    throw new Error('expected a v2 request');
  }
  return parsed;
}

async function body(response: Response) {
  return (await response.json()) as Record<string, any>;
}

describe('parseMemberListRequest', () => {
  it('keeps v1 when no version is requested', () => {
    expect(
      parseMemberListRequest(new Request('http://localhost/members'))
    ).toEqual({ version: 1 });
  });

  it.each([
    ['?version=3', 'UNSUPPORTED_VERSION'],
    ['?version=2&limit=0', 'INVALID_LIMIT'],
    ['?version=2&limit=501', 'INVALID_LIMIT'],
    ['?version=2&limit=abc', 'INVALID_LIMIT'],
    ['?version=2&cursor=not-a-cursor', 'INVALID_CURSOR'],
  ])('rejects %s with %s', async (query, code) => {
    const parsed = parseMemberListRequest(
      new Request(`http://localhost/members${query}`)
    );
    expect(parsed).toBeInstanceOf(Response);
    expect((parsed as Response).status).toBe(400);
    expect((await body(parsed as Response)).code).toBe(code);
  });
});

describe('member list v2 pagination', () => {
  it('marks a single exhaustive page complete', async () => {
    const response = paginateMemberListV2(snapshot(), v2());
    const page = await body(response);

    expect(page).toMatchObject({
      complete: true,
      nextCursor: null,
      total: 3,
      version: 2,
    });
    expect(page.members.map((m: { id: string }) => m.id)).toEqual([
      'user-a',
      'user-b',
      'user-c',
    ]);
    expect(page.members[0]).toMatchObject({
      isCurrentUser: true,
      membershipType: 'MEMBER',
      role: 'member',
    });
    expect(page.members[0].membershipRevision).toMatch(/^mr1_[0-9a-f]{32}$/);
    expect(page.incompleteReason).toBeUndefined();
  });

  it('is complete only on the final page of a same-revision chain', async () => {
    const invitations = [{ createdAt: null, email: 'invitee@example.com' }];
    const snap = snapshot({ invitations });

    const first = await body(paginateMemberListV2(snap, v2('&limit=2')));
    expect(first.complete).toBe(false);
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(first.members).toHaveLength(2);
    expect(first.invitations).toEqual([]);

    const second = await body(
      paginateMemberListV2(snap, v2(`&limit=2&cursor=${first.nextCursor}`))
    );
    expect(second.complete).toBe(true);
    expect(second.nextCursor).toBeNull();
    expect(second.members.map((m: { id: string }) => m.id)).toEqual([
      'user-c',
    ]);
    expect(second.invitations).toEqual(invitations);
    expect(second.revision).toBe(first.revision);
    expect(second.total).toBe(4);
  });

  it('refuses a cursor from an older revision', async () => {
    const first = await body(
      paginateMemberListV2(snapshot(), v2('&limit=1'))
    );
    const changed = snapshot({ members: ['user-a', 'user-b'] });
    const response = paginateMemberListV2(
      changed,
      v2(`&limit=1&cursor=${first.nextCursor}`)
    );

    expect(response.status).toBe(409);
    expect(await body(response)).toMatchObject({
      code: 'REVISION_CHANGED',
      revision: changed.revision,
    });
  });

  it('refuses a hand-made cursor at or past the end of the list', async () => {
    const snap = snapshot();
    const forged = Buffer.from(
      JSON.stringify({ o: 3, r: snap.revision, v: 2 })
    ).toString('base64url');
    const response = paginateMemberListV2(snap, v2(`&cursor=${forged}`));

    expect(response.status).toBe(400);
    expect((await body(response)).code).toBe('INVALID_CURSOR');
  });

  it('never claims completeness when the platform cannot prove it', async () => {
    for (const [snap, reason] of [
      [snapshot({ exhaustive: false }), 'membership_scan_limit'],
      [snapshot({ rowCount: 1000 }), 'row_cap'],
      [snapshot({ rowCount: null }), 'row_cap'],
      [
        snapshot({ members: ['user-a'], rows: [row('user-a'), row('user-z')] }),
        'unresolved_members',
      ],
    ] as const) {
      const page = await body(paginateMemberListV2(snap, v2()));
      expect(page.complete).toBe(false);
      expect(page.incompleteReason).toBe(reason);
      expect(page.nextCursor).toBeNull();
    }
  });

  it('pages invitations whose emails are masked', async () => {
    const invitations = [
      { createdAt: '2026-11-02T00:00:00Z', email: null },
      { createdAt: '2026-11-01T00:00:00Z', email: null },
    ];
    const page = await body(
      paginateMemberListV2(snapshot({ invitations }), v2())
    );
    expect(page.invitations).toEqual([invitations[1], invitations[0]]);
    expect(page.total).toBe(5);
    expect(page.complete).toBe(true);
  });

  it('drops board guests that have no membership row', async () => {
    const page = await body(
      paginateMemberListV2(snapshot({ extraV1: ['board-guest'] }), v2())
    );
    expect(page.members.map((m: { id: string }) => m.id)).not.toContain(
      'board-guest'
    );
    expect(page.complete).toBe(true);
  });

  it('reports workspace guests with their membership type', async () => {
    const page = await body(
      paginateMemberListV2(
        snapshot({
          rows: [row('user-a'), row('user-b', undefined, 'GUEST'), row('user-c')],
        }),
        v2()
      )
    );
    expect(page.members[1]).toMatchObject({
      id: 'user-b',
      membershipType: 'GUEST',
    });
  });
});

describe('member list revisions', () => {
  it('changes the list revision when a member is added or removed', () => {
    const base = snapshot().revision;
    expect(snapshot({ members: ['user-a', 'user-b'] }).revision).not.toBe(base);
    expect(
      snapshot({ members: ['user-a', 'user-b', 'user-c', 'user-d'] }).revision
    ).not.toBe(base);
    expect(snapshot().revision).toBe(base);
  });

  it('detects a remove-and-readd between observations', () => {
    const before = snapshot();
    const after = snapshot({
      rows: [
        row('user-a'),
        row('user-b', '2026-11-25T09:00:00.000001+00:00'),
        row('user-c'),
      ],
    });

    expect(after.revision).not.toBe(before.revision);
    expect(after.members[1]?.membershipRevision).not.toBe(
      before.members[1]?.membershipRevision
    );
    expect(after.members[0]?.membershipRevision).toBe(
      before.members[0]?.membershipRevision
    );
  });

  it('does not depend on whether the caller may read invitation emails', () => {
    const at = '2026-11-20T03:00:00Z';
    const visible = snapshot({
      invitations: [{ createdAt: at, email: 'invitee@example.com' }],
    });
    const masked = snapshot({ invitations: [{ createdAt: at, email: null }] });
    expect(masked.revision).toBe(visible.revision);
    expect(snapshot().revision).not.toBe(visible.revision);
  });

  it('changes the membership revision on a MEMBER/GUEST change', () => {
    expect(membershipRevision(WS, row('user-a'))).not.toBe(
      membershipRevision(WS, row('user-a', undefined, 'GUEST'))
    );
  });

  it('does not depend on the calling user', () => {
    const snap = snapshot();
    const otherCaller = buildMemberListV2Snapshot({
      memberships: {
        exhaustive: true,
        rows: ['user-a', 'user-b', 'user-c'].map((id) => row(id)),
      },
      rowCount: 10,
      v1: {
        context: {
          canManageMembers: false,
          canManageRoles: false,
          defaultAdminEnabled: false,
        },
        invitations: [],
        members: ['user-a', 'user-b', 'user-c'].map((id) => ({
          ...v1Member(id),
          isCurrentUser: id === 'user-b',
        })) as never,
      },
      wsId: WS,
    });
    expect(otherCaller.revision).toBe(snap.revision);
  });
});

describe('scanWorkspaceMemberships', () => {
  function adminReturning(
    pages: Array<{ count?: number; rows: MembershipRow[] }>
  ) {
    const afters: Array<string | null> = [];
    let call = 0;
    let after: string | null = null;
    const builder = {
      eq: () => builder,
      gt: (_column: string, value: string) => {
        after = value;
        return builder;
      },
      limit: async () => {
        afters.push(after);
        after = null;
        const page = pages[call++] ?? { rows: [] };
        return { count: page.count ?? null, data: page.rows, error: null };
      },
      order: () => builder,
      select: () => builder,
    };
    return {
      admin: { from: () => builder } as never,
      afters,
    };
  }

  const many = (n: number, prefix: string) =>
    Array.from({ length: n }, (_, i) =>
      row(`${prefix}-${String(i).padStart(4, '0')}`)
    );

  it('reads past the PostgREST row cap with keyset reads', async () => {
    const first = many(1000, 'a');
    const { admin, afters } = adminReturning([
      { count: 1500, rows: first },
      { rows: many(500, 'b') },
    ]);
    const result = await scanWorkspaceMemberships(admin, WS);

    expect(afters).toEqual([null, first.at(-1)?.user_id]);
    expect(result.rows).toHaveLength(1500);
    expect(result.exhaustive).toBe(true);
  });

  it('is not exhaustive when the exact count disagrees', async () => {
    const { admin } = adminReturning([{ count: 4, rows: many(3, 'a') }]);
    expect((await scanWorkspaceMemberships(admin, WS)).exhaustive).toBe(false);
  });
});
