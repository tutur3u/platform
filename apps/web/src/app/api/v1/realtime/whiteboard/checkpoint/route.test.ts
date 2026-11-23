// @vitest-environment node
import { createHash } from 'node:crypto';
import { signRealtimePayload } from '@tuturuuu/realtime/core/token';
import { canonicalScene } from '@tuturuuu/realtime/meet/board-sync-merge';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  meeting: { ws_id: 'ws' } as Record<string, unknown> | null,
  link: { ws_id: 'ws', guest_access: 'view' } as Record<string, unknown> | null,
  board: null as Record<string, unknown> | null,
  updates: [] as Record<string, unknown>[],
  casRows: 1,
  dbError: false,
}));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => {
  const query = (table: string) => {
    const filters: Record<string, unknown> = {};
    let pendingUpdate: Record<string, unknown> | null = null;
    const chain: any = {
      select: () => chain,
      update: (value: Record<string, unknown>) => {
        pendingUpdate = value;
        return chain;
      },
      eq: (key: string, value: unknown) => {
        filters[key] = value;
        return chain;
      },
      is: () => chain,
      maybeSingle: async () => ({
        data:
          table === 'workspace_meetings'
            ? state.meeting
            : table === 'meet_whiteboards'
              ? state.link
              : state.board,
        error: state.dbError ? { code: 'x' } : null,
      }),
      then: (resolve: (value: unknown) => void) => {
        if (pendingUpdate) {
          state.updates.push({ ...pendingUpdate, filters });
          resolve({
            data: state.casRows
              ? [{ updated_at: String(pendingUpdate.updated_at) }]
              : [],
            error: null,
          });
        }
      },
    };
    return chain;
  };
  const client: any = { from: query, schema: () => ({ from: query }) };
  return { createAdminClient: async () => client };
});

const { POST } = await import('./route');
const secret = 'disposable-test-secret';
const ids = {
  meetingId: '11111111-2222-4333-8444-555555555555',
  wsId: '22222222-3333-4444-8555-666666666666',
  boardId: '33333333-4444-4555-8666-777777777777',
};
const rect = (id: string, version = 1) => ({
  id,
  type: 'rectangle',
  version,
  versionNonce: 1,
});
const hash = (elements: unknown[]) =>
  createHash('sha256').update(canonicalScene(elements as never)).digest('hex');
function call(body: unknown, over: Record<string, unknown> = {}) {
  const token = signRealtimePayload(
    {
      aud: 'tuturuuu.meet.whiteboard',
      kind: 'checkpoint',
      ...ids,
      actorKind: 'system',
      userId: 'system',
      displayName: 'Checkpoint',
      role: 'edit',
      exp: Math.floor(Date.now() / 1000) + 30,
      ...over,
    },
    secret
  );
  return POST(
    new Request('https://web.invalid/api/v1/realtime/whiteboard/checkpoint', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
  );
}
const flush = (elements: unknown[], base: string | null, extra = {}) => ({
  op: 'flush',
  elements,
  revision: 1,
  baseUpdatedAt: base,
  hash: hash(elements),
  ...extra,
});

describe('whiteboard checkpoint route', () => {
  beforeEach(() => {
    vi.stubEnv('MEET_REALTIME_TOKEN_SECRET', secret);
    state.meeting = { ws_id: ids.wsId };
    state.link = { ws_id: ids.wsId, guest_access: 'view' };
    state.board = {
      ws_id: ids.wsId,
      archived_at: null,
      updated_at: 't1',
      snapshot: {
        elements: [rect('a'), { id: 'img', type: 'image', version: 1, versionNonce: 1 }],
        appState: { viewBackgroundColor: '#fff' },
      },
    };
    state.updates = [];
    state.casRows = 1;
    state.dbError = false;
  });
  afterEach(() => vi.unstubAllEnvs());

  it('rejects missing, wrong-kind and expired tickets', async () => {
    const noToken = await POST(
      new Request('https://web.invalid/x', { method: 'POST', body: '{}' })
    );
    expect(noToken.status).toBe(401);
    expect((await call({ op: 'load' }, { kind: 'join' })).status).toBe(401);
    expect((await call({ op: 'load' }, { actorKind: 'guest' })).status).toBe(401);
    expect((await call({ op: 'load' }, { exp: 1 })).status).toBe(401);
  });

  it('loads only the elements the room can edit', async () => {
    const response = await call({ op: 'load' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ updatedAt: 't1', elements: [rect('a')] });
  });

  it('refuses a missing link, a foreign workspace and an archived board', async () => {
    state.link = null;
    expect((await call({ op: 'load' })).status).toBe(404);
    state.link = { ws_id: ids.wsId, guest_access: 'view' };
    state.meeting = { ws_id: 'other' };
    expect((await call({ op: 'load' })).status).toBe(404);
    state.meeting = { ws_id: ids.wsId };
    state.board!.archived_at = 'now';
    expect((await call({ op: 'load' })).status).toBe(410);
  });

  it('stores the scene with compare-and-set and keeps unsupported elements and app state', async () => {
    const elements = [rect('a', 2), rect('b')];
    const response = await call(flush(elements, 't1'));
    expect(response.status).toBe(200);
    expect(state.updates).toHaveLength(1);
    const update = state.updates[0]!;
    expect((update.filters as any).updated_at).toBe('t1');
    expect((update.snapshot as any).appState).toEqual({ viewBackgroundColor: '#fff' });
    expect((update.snapshot as any).elements.map((e: any) => e.id)).toEqual([
      'a',
      'b',
      'img',
    ]);
  });

  it('answers a replay of identical content as success without writing', async () => {
    state.board!.snapshot = { elements: [rect('a', 2)], appState: {} };
    state.board!.updated_at = 't2';
    const response = await call(flush([rect('a', 2)], 't1'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ updatedAt: 't2' });
    expect(state.updates).toHaveLength(0);
  });

  it('reports a conflict with the stored scene when the base is stale', async () => {
    state.board!.updated_at = 't2';
    const response = await call(flush([rect('z')], 't1'));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ updatedAt: 't2', elements: [rect('a')] });
    expect(state.updates).toHaveLength(0);
  });

  it('reports a conflict when the compare-and-set loses a race', async () => {
    state.casRows = 0;
    const response = await call(flush([rect('z')], 't1'));
    expect(response.status).toBe(409);
    expect(state.updates).toHaveLength(1);
  });

  it('rejects a body whose hash does not match and malformed bodies', async () => {
    expect((await call(flush([rect('a')], 't1', { hash: 'a'.repeat(64) }))).status).toBe(400);
    expect((await call({ op: 'flush' })).status).toBe(400);
    expect((await call({ op: 'load', extra: 1 })).status).toBe(400);
  });

  it('answers 503 when the database fails', async () => {
    state.dbError = true;
    expect((await call({ op: 'load' })).status).toBe(503);
  });
});
