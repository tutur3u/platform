import { describe, expect, it } from 'vitest';
import {
  boardRoleFor,
  checkBoardOpen,
  isTerminalCheckpointStatus,
  sameBoardSession,
} from './board-sync-access';
import {
  applyBoardChanges,
  chunkElements,
  mergeElements,
  pruneTombstones,
  sceneFrom,
} from './board-sync-merge';
import {
  BOARD_LIMITS,
  type BoardElement,
  boardClientMessage,
  boardElementSchema,
  boardTicketSchema,
} from './board-sync-schema';

const el = (id: string, version = 1, nonce = 1, extra: object = {}) =>
  ({
    id,
    type: 'rectangle',
    version,
    versionNonce: nonce,
    ...extra,
  }) as BoardElement;

describe('access', () => {
  it('lets live members edit and caps everyone else by guest access', () => {
    expect(
      boardRoleFor({ kind: 'member', workspaceMember: true }, 'none')
    ).toBe('edit');
    expect(
      boardRoleFor({ kind: 'member', workspaceMember: false }, 'view')
    ).toBe('view');
    expect(boardRoleFor({ kind: 'guest' }, 'draw')).toBe('edit');
    expect(boardRoleFor({ kind: 'guest' }, 'view')).toBe('view');
    expect(boardRoleFor({ kind: 'guest' }, 'none')).toBeNull();
    expect(
      boardRoleFor({ kind: 'member', workspaceMember: false }, 'none')
    ).toBeNull();
  });

  it('refuses a missing link, missing or archived board and cross-workspace rows', () => {
    const ok = {
      link: { ws_id: 'w', guest_access: 'view' as const },
      board: { ws_id: 'w', archived_at: null },
      meetingWsId: 'w',
    };
    expect(checkBoardOpen(ok)).toEqual({ ok: true, guestAccess: 'view' });
    expect(checkBoardOpen({ ...ok, link: null })).toEqual({
      ok: false,
      reason: 'link-missing',
    });
    expect(checkBoardOpen({ ...ok, board: null })).toEqual({
      ok: false,
      reason: 'board-missing',
    });
    expect(
      checkBoardOpen({ ...ok, board: { ws_id: 'w', archived_at: 'now' } })
    ).toEqual({ ok: false, reason: 'board-archived' });
    expect(checkBoardOpen({ ...ok, meetingWsId: 'x' })).toEqual({
      ok: false,
      reason: 'workspace-mismatch',
    });
    expect(
      checkBoardOpen({ ...ok, board: { ws_id: 'x', archived_at: null } })
    ).toEqual({ ok: false, reason: 'workspace-mismatch' });
  });

  it('keeps the actor fixed across a refresh', () => {
    const a = { meetingId: 'm', boardId: 'b', userId: 'u', wsId: 'w' };
    expect(sameBoardSession(a, { ...a })).toBe(true);
    expect(sameBoardSession(a, { ...a, userId: 'v' })).toBe(false);
    expect(sameBoardSession(a, { ...a, boardId: 'c' })).toBe(false);
    expect(isTerminalCheckpointStatus(404)).toBe(true);
    expect(isTerminalCheckpointStatus(503)).toBe(false);
  });
});

describe('merge', () => {
  it('converges regardless of arrival order and is idempotent', () => {
    const a = el('x', 2, 5);
    const b = el('x', 2, 3);
    const one = sceneFrom([a]);
    mergeElements(one, [b]);
    const two = sceneFrom([b]);
    mergeElements(two, [a]);
    expect(one.get('x')).toEqual(b);
    expect(two.get('x')).toEqual(b);
    expect(mergeElements(one, [b, a])).toEqual([]);
  });

  it('refuses new elements past the budget but still applies updates', () => {
    const scene = sceneFrom(
      Array.from({ length: BOARD_LIMITS.maxElements }, (_, i) => el(`e${i}`))
    );
    const applied = applyBoardChanges(scene, [
      { type: 'insert', element: el('extra') },
      { type: 'update', element: el('e0', 2) },
    ]);
    expect(applied.map((c) => c.element.id)).toEqual(['e0']);
    expect(scene.size).toBe(BOARD_LIMITS.maxElements);
  });

  it('prunes deleted elements only near the budget', () => {
    const scene = sceneFrom([el('a', 1, 1, { isDeleted: true }), el('b')]);
    expect(pruneTombstones(scene)).toBe(0);
    const full = sceneFrom(
      Array.from({ length: BOARD_LIMITS.maxElements }, (_, i) =>
        el(`e${i}`, 1, 1, { isDeleted: i % 2 === 0 })
      )
    );
    expect(pruneTombstones(full)).toBeGreaterThan(0);
    expect([...full.values()].some((e) => !e.isDeleted)).toBe(true);
    expect(full.size).toBeLessThanOrEqual(
      Math.floor(BOARD_LIMITS.maxElements * 0.9)
    );
  });

  it('splits a scene into bounded chunks without losing elements', () => {
    const elements = Array.from({ length: 50 }, (_, i) =>
      el(`e${i}`, 1, 1, { text: 'x'.repeat(200) })
    );
    const chunks = chunkElements(elements, 2000);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.flat()).toEqual(elements);
    expect(chunkElements([], 100)).toEqual([[]]);
  });
});

describe('schema', () => {
  it('rejects image elements and oversized elements', () => {
    expect(
      boardElementSchema.safeParse({ ...el('i'), type: 'image' }).success
    ).toBe(false);
    expect(
      boardElementSchema.safeParse(
        el('big', 1, 1, { text: 'x'.repeat(BOARD_LIMITS.maxElementBytes) })
      ).success
    ).toBe(false);
    expect(boardElementSchema.safeParse(el('ok')).success).toBe(true);
  });

  it('rejects unknown message shapes and oversized batches', () => {
    expect(
      boardClientMessage.safeParse({ type: 'cursor', x: 1, y: 2 }).success
    ).toBe(true);
    expect(
      boardClientMessage.safeParse({ type: 'cursor', x: Number.NaN, y: 2 })
        .success
    ).toBe(false);
    expect(boardClientMessage.safeParse({ type: 'nope' }).success).toBe(false);
    expect(
      boardClientMessage.safeParse({
        type: 'elements',
        changes: Array.from(
          { length: BOARD_LIMITS.maxChangesPerMessage + 1 },
          (_, i) => ({
            type: 'insert',
            element: el(`e${i}`),
          })
        ),
      }).success
    ).toBe(false);
  });

  it('keeps tickets strict', () => {
    const base = {
      aud: 'tuturuuu.meet.whiteboard',
      kind: 'join',
      meetingId: crypto.randomUUID(),
      wsId: crypto.randomUUID(),
      boardId: crypto.randomUUID(),
      actorKind: 'guest',
      userId: 'g',
      displayName: 'G',
      role: 'view',
      exp: 1,
    };
    expect(boardTicketSchema.safeParse(base).success).toBe(true);
    expect(boardTicketSchema.safeParse({ ...base, extra: 1 }).success).toBe(
      false
    );
    expect(
      boardTicketSchema.safeParse({ ...base, role: 'owner' }).success
    ).toBe(false);
  });
});
