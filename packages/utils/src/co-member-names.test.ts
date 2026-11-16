import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCoMemberEmailFallbacks,
  resolveCoMemberNames,
} from './co-member-names';

vi.mock('server-only', () => ({}));

type Row = Record<string, unknown>;
interface Tables {
  workspace_secrets: Row[];
  workspace_members: Row[];
  user_private_details: Row[];
}

const WS = 'ws-1';
const VIEWER = 'viewer';

let tables: Tables;
let failing: Set<keyof Tables>;
let reads: { table: string; ids?: unknown[] }[];

function fakeAdmin(): TypedSupabaseClient {
  return {
    from(table: keyof Tables) {
      const filters: Array<(row: Row) => boolean> = [];
      let ids: unknown[] | undefined;
      const builder = {
        select: () => builder,
        eq(column: string, value: unknown) {
          filters.push((row) => row[column] === value);
          return builder;
        },
        in(column: string, values: unknown[]) {
          ids = values;
          filters.push((row) => values.includes(row[column]));
          return builder;
        },
        then(resolve: (value: unknown) => unknown) {
          reads.push({ table, ids });
          if (failing.has(table)) {
            return Promise.resolve({
              data: null,
              error: { message: 'x' },
            }).then(resolve);
          }
          const data = tables[table].filter((row) =>
            filters.every((f) => f(row))
          );
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return builder;
    },
  } as unknown as TypedSupabaseClient;
}

beforeEach(() => {
  failing = new Set();
  reads = [];
  tables = {
    workspace_secrets: [],
    workspace_members: [
      { ws_id: WS, user_id: VIEWER, type: 'MEMBER' },
      { ws_id: WS, user_id: 'member-a', type: 'MEMBER' },
      { ws_id: WS, user_id: 'guest-g', type: 'GUEST' },
      { ws_id: 'ws-other', user_id: 'outsider', type: 'MEMBER' },
    ],
    user_private_details: [
      { user_id: 'member-a', email: 'a@example.com' },
      { user_id: 'guest-g', email: 'g@example.com' },
      { user_id: 'outsider', email: 'o@example.com' },
      { user_id: VIEWER, email: 'v@example.com' },
    ],
  };
});

const users = [
  { id: 'member-a', display_name: null, full_name: null, handle: 'aa' },
  { id: 'guest-g', display_name: null, handle: 'gg' },
  { id: 'outsider', display_name: '', handle: 'oo' },
  { id: 'named', display_name: 'Named Person', full_name: null },
];

describe('resolveCoMemberNames', () => {
  it('uses a co-member email as the fallback name for a member viewer', async () => {
    const names = await resolveCoMemberNames({
      admin: fakeAdmin(),
      wsId: WS,
      viewerUserId: VIEWER,
      users,
    });
    expect(names.get('member-a')).toBe('a@example.com');
    expect(names.get('named')).toBe('Named Person');
  });

  it('never resolves guest or other-workspace targets to their email', async () => {
    const names = await resolveCoMemberNames({
      admin: fakeAdmin(),
      wsId: WS,
      viewerUserId: VIEWER,
      users,
    });
    expect(names.get('guest-g')).toBe('gg');
    expect(names.get('outsider')).toBe('oo');
  });

  it('reads private emails only for eligible members without a name', async () => {
    await resolveCoMemberNames({
      admin: fakeAdmin(),
      wsId: WS,
      viewerUserId: VIEWER,
      users,
    });
    const privateRead = reads.find((r) => r.table === 'user_private_details');
    expect(privateRead?.ids).toEqual(['member-a']);
  });

  it('respects HIDE_MEMBER_EMAIL=true and skips the private read', async () => {
    tables.workspace_secrets = [
      { ws_id: WS, name: 'HIDE_MEMBER_EMAIL', value: 'true' },
    ];
    const names = await resolveCoMemberNames({
      admin: fakeAdmin(),
      wsId: WS,
      viewerUserId: VIEWER,
      users,
    });
    expect(names.get('member-a')).toBe('aa');
    expect(reads.some((r) => r.table === 'user_private_details')).toBe(false);
  });

  it('still shows emails when HIDE_MEMBER_EMAIL is set but not true', async () => {
    tables.workspace_secrets = [
      { ws_id: WS, name: 'HIDE_MEMBER_EMAIL', value: 'false' },
    ];
    const names = await resolveCoMemberNames({
      admin: fakeAdmin(),
      wsId: WS,
      viewerUserId: VIEWER,
      users,
    });
    expect(names.get('member-a')).toBe('a@example.com');
  });

  it.each([
    ['a guest viewer', 'guest-g'],
    ['a non-member viewer', 'outsider'],
    ['an anonymous viewer', null],
  ])('gives %s no emails', async (_label, viewer) => {
    const names = await resolveCoMemberNames({
      admin: fakeAdmin(),
      wsId: WS,
      viewerUserId: viewer,
      users,
    });
    expect(names.get('member-a')).toBe('aa');
    expect(reads.some((r) => r.table === 'user_private_details')).toBe(false);
  });

  it('fails closed without a workspace id', async () => {
    const names = await resolveCoMemberNames({
      admin: fakeAdmin(),
      wsId: '',
      viewerUserId: VIEWER,
      users,
    });
    expect(names.get('member-a')).toBe('aa');
    expect(reads).toHaveLength(0);
  });

  it.each([
    'workspace_secrets',
    'workspace_members',
    'user_private_details',
  ] as const)('fails closed when %s errors', async (table) => {
    failing.add(table);
    const names = await resolveCoMemberNames({
      admin: fakeAdmin(),
      wsId: WS,
      viewerUserId: VIEWER,
      users,
    });
    expect(names.get('member-a')).toBe('aa');
  });

  it('skips all queries when every user already has a name', async () => {
    await resolveCoMemberNames({
      admin: fakeAdmin(),
      wsId: WS,
      viewerUserId: VIEWER,
      users: [{ id: 'named', display_name: 'Named Person' }],
    });
    expect(reads).toHaveLength(0);
  });

  it('supports the full-name slot and email local part', async () => {
    const names = await resolveCoMemberNames({
      admin: fakeAdmin(),
      wsId: WS,
      viewerUserId: VIEWER,
      users: [
        { id: 'member-a', display_name: 'Display', full_name: 'Full' },
        { id: 'x', display_name: null },
      ],
      slot: 'full',
    });
    expect(names.get('member-a')).toBe('Full');

    const short = await resolveCoMemberNames({
      admin: fakeAdmin(),
      wsId: WS,
      viewerUserId: VIEWER,
      users: [{ id: 'member-a' }],
      options: { emailLocalPart: true },
    });
    expect(short.get('member-a')).toBe('a');
  });
});

describe('private full name (user_private_details)', () => {
  beforeEach(() => {
    tables.user_private_details = [
      {
        user_id: 'member-a',
        full_name: 'Private Full',
        email: 'a@example.com',
      },
    ];
  });

  it('prefers the private full name over the email', async () => {
    const names = await resolveCoMemberNames({
      admin: fakeAdmin(),
      wsId: WS,
      viewerUserId: VIEWER,
      users: [{ id: 'member-a', display_name: null, handle: 'aa' }],
    });
    expect(names.get('member-a')).toBe('Private Full');
  });

  it('HIDE_MEMBER_NAME hides the private full name but keeps the email', async () => {
    tables.workspace_secrets = [
      { ws_id: WS, name: 'HIDE_MEMBER_NAME', value: 'true' },
    ];
    const names = await resolveCoMemberNames({
      admin: fakeAdmin(),
      wsId: WS,
      viewerUserId: VIEWER,
      users: [{ id: 'member-a', display_name: null, handle: 'aa' }],
    });
    expect(names.get('member-a')).toBe('a@example.com');
  });

  it('HIDE_MEMBER_EMAIL keeps the private full name but never the email', async () => {
    tables.workspace_secrets = [
      { ws_id: WS, name: 'HIDE_MEMBER_EMAIL', value: 'true' },
    ];
    const names = await resolveCoMemberNames({
      admin: fakeAdmin(),
      wsId: WS,
      viewerUserId: VIEWER,
      users: [{ id: 'member-a', display_name: null, handle: 'aa' }],
    });
    expect(names.get('member-a')).toBe('Private Full');
  });

  it('both secrets on: handle only and no private read', async () => {
    tables.workspace_secrets = [
      { ws_id: WS, name: 'HIDE_MEMBER_EMAIL', value: 'true' },
      { ws_id: WS, name: 'HIDE_MEMBER_NAME', value: 'TRUE' },
    ];
    const names = await resolveCoMemberNames({
      admin: fakeAdmin(),
      wsId: WS,
      viewerUserId: VIEWER,
      users: [{ id: 'member-a', display_name: null, handle: 'aa' }],
    });
    expect(names.get('member-a')).toBe('aa');
    expect(reads.some((r) => r.table === 'user_private_details')).toBe(false);
  });

  it('never reads a private full name for a guest target', async () => {
    tables.user_private_details.push({
      user_id: 'guest-g',
      full_name: 'Guest Private',
      email: 'g@example.com',
    });
    const names = await resolveCoMemberNames({
      admin: fakeAdmin(),
      wsId: WS,
      viewerUserId: VIEWER,
      users: [{ id: 'guest-g', display_name: null, handle: 'gg' }],
    });
    expect(names.get('guest-g')).toBe('gg');
  });
});

describe('getCoMemberEmailFallbacks', () => {
  it('returns only eligible member emails', async () => {
    const emails = await getCoMemberEmailFallbacks({
      admin: fakeAdmin(),
      wsId: WS,
      viewerUserId: VIEWER,
      userIds: ['member-a', 'guest-g', 'outsider', null, 'member-a'],
    });
    expect([...emails.entries()]).toEqual([['member-a', 'a@example.com']]);
  });
});
