import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPostEmailGroupMemberIds as infrastructureMembers } from '../../../../apps/infrastructure/src/lib/post-email-queue/group-membership';
import { getPostEmailGroupMemberIds as webMembers } from '../../../../apps/web/src/lib/post-email-queue/group-membership';

const WS = '11111111-1111-4111-8111-111111111111';
const GROUP = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const memberId = (i: number) =>
  `44444444-4444-4444-8444-${i.toString(16).padStart(12, '0')}`;
type Member = { user_id: string; group_id: string; ws_id: string };
let rows: Member[];
let reads: URL[];
let failure: 'error' | 'null' | null;

const fixtureFetch: typeof fetch = async (input) => {
  const url = new URL(String(input));
  reads.push(url);
  expect(url.pathname).toBe('/rest/v1/workspace_user_groups_users');
  if (failure === 'error')
    return Response.json({ message: 'Fixture failed' }, { status: 500 });
  if (failure === 'null') return Response.json(null);
  const inner = url.searchParams
    .get('select')
    ?.includes('workspace_users!inner');
  return Response.json(
    rows
      .filter(
        (row) =>
          (!url.searchParams.has('group_id') ||
            url.searchParams.get('group_id') === `eq.${row.group_id}`) &&
          (!inner ||
            !url.searchParams.has('workspace_users.ws_id') ||
            url.searchParams.get('workspace_users.ws_id') ===
              `eq.${row.ws_id}`) &&
          (url.searchParams.get('user_id') ?? '').includes(row.user_id)
      )
      .map((row) => ({
        user_id: row.user_id,
        workspace_users: { ws_id: row.ws_id },
      }))
  );
};

beforeEach(() => {
  rows = [];
  reads = [];
  failure = null;
  vi.stubEnv('SUPABASE_SERVER_URL', 'https://fixture.invalid');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fixture.invalid');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'fixture-only');
});
afterEach(() => vi.unstubAllEnvs());

for (const [label, getMembers] of [
  ['web', webMembers],
  ['infrastructure', infrastructureMembers],
] as const) {
  describe(`${label} participant lookup through PostgREST`, () => {
    it('requires group membership and an inner user workspace match', async () => {
      rows = [
        { user_id: memberId(1), group_id: GROUP, ws_id: WS },
        { user_id: memberId(2), group_id: OTHER, ws_id: WS },
        { user_id: memberId(3), group_id: GROUP, ws_id: OTHER },
      ];
      const client = await createAdminClient({
        noCookie: true,
        fetch: fixtureFetch,
      });
      expect(
        await getMembers(client, {
          wsId: WS,
          groupId: GROUP,
          userIds: rows.map((row) => row.user_id),
        })
      ).toEqual(new Set([memberId(1)]));
      expect(reads[0]?.searchParams.get('select')).toContain(
        'workspace_users!inner'
      );
      expect(reads[0]?.searchParams.get('group_id')).toBe(`eq.${GROUP}`);
      expect(reads[0]?.searchParams.get('workspace_users.ws_id')).toBe(
        `eq.${WS}`
      );
    });
    it('chunks and deduplicates all requested participants', async () => {
      rows = Array.from({ length: 201 }, (_, i) => ({
        user_id: memberId(i),
        group_id: GROUP,
        ws_id: WS,
      }));
      const client = await createAdminClient({
        noCookie: true,
        fetch: fixtureFetch,
      });
      expect(
        await getMembers(client, {
          wsId: WS,
          groupId: GROUP,
          userIds: [...rows.map((row) => row.user_id), memberId(0)],
        })
      ).toEqual(new Set(rows.map((row) => row.user_id)));
      expect(reads).toHaveLength(2);
      expect(
        reads.map(
          (url) => (url.searchParams.get('user_id') ?? '').split(',').length
        )
      ).toEqual([200, 1]);
    });
    it('does not read for an empty cohort', async () => {
      const client = await createAdminClient({
        noCookie: true,
        fetch: fixtureFetch,
      });
      expect(
        await getMembers(client, { wsId: WS, groupId: GROUP, userIds: [] })
      ).toEqual(new Set());
      expect(reads).toEqual([]);
    });
    it.each(['error', 'null'] as const)(
      'fails closed on %s data',
      async (mode) => {
        failure = mode;
        const client = await createAdminClient({
          noCookie: true,
          fetch: fixtureFetch,
        });
        await expect(
          getMembers(client, {
            wsId: WS,
            groupId: GROUP,
            userIds: [memberId(1)],
          })
        ).rejects.toBeDefined();
      }
    );
  });
}
