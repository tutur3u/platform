import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeDb } from './fake-db.test-support';

const WS = '22222222-2222-4222-8222-222222222222';
const TASK = '33333333-3333-4333-8333-333333333333';
const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '44444444-4444-4444-8444-444444444444';
const C1 = '55555555-5555-4555-8555-555555555551';
const C2 = '55555555-5555-4555-8555-555555555552';
const C3 = '55555555-5555-4555-8555-555555555553';

const mocks = vi.hoisted(() => ({
  canManage: vi.fn(),
  requireTaskScope: vi.fn(),
}));

vi.mock('./access', () => ({
  canManageProjects: mocks.canManage,
  jsonError: (message: string, status: number) =>
    NextResponse.json({ error: message }, { status }),
  requireTaskScope: mocks.requireTaskScope,
}));
vi.mock('@tuturuuu/utils/co-member-names', () => ({
  resolveCoMemberNames: async () => new Map(),
}));

import {
  handleTaskCommentDELETE,
  handleTaskCommentPATCH,
  handleTaskCommentsGET,
  handleTaskCommentsPOST,
} from './comments';

let db: FakeDb;
let userId = ME;

function allow() {
  mocks.requireTaskScope.mockImplementation(async () => ({
    access: { mode: 'member', permission: 'edit' },
    admin: db,
    taskId: TASK,
    user: { id: userId },
    wsId: WS,
  }));
}

const request = (method: string, body?: unknown, query = '') =>
  new NextRequest(
    `http://localhost/api/v1/workspaces/${WS}/tasks/${TASK}/comments${query}`,
    {
      method,
      ...(body === undefined
        ? {}
        : {
            body: JSON.stringify(body),
            headers: { 'content-type': 'application/json' },
          }),
    }
  );
const taskCtx = { params: Promise.resolve({ wsId: WS, taskId: TASK }) };
const commentCtx = (commentId: string) => ({
  params: Promise.resolve({ wsId: WS, taskId: TASK, commentId }),
});

beforeEach(() => {
  vi.clearAllMocks();
  userId = ME;
  mocks.canManage.mockResolvedValue(false);
  db = new FakeDb()
    .seed('users', [
      { id: ME, display_name: 'Me', handle: 'me', avatar_url: null },
      {
        id: OTHER,
        display_name: 'Other',
        handle: 'other',
        avatar_url: 'https://x/a.png',
      },
    ])
    .seed('private.task_comments', [
      {
        id: C1,
        task_id: TASK,
        ws_id: WS,
        author_id: ME,
        external_author: null,
        external_url: null,
        body: 'mine',
        created_at: '2024-01-01T00:00:00+00:00',
        edited_at: null,
        deleted_at: null,
      },
      {
        id: C2,
        task_id: TASK,
        ws_id: WS,
        author_id: OTHER,
        external_author: null,
        external_url: null,
        body: 'theirs',
        created_at: '2024-01-02T00:00:00+00:00',
        edited_at: null,
        deleted_at: null,
      },
      {
        id: C3,
        task_id: TASK,
        ws_id: WS,
        author_id: null,
        external_author: 'octocat',
        external_url: 'https://github.com/o/r/issues/1#c',
        body: 'gone',
        created_at: '2024-01-03T00:00:00+00:00',
        edited_at: null,
        deleted_at: '2024-02-01T00:00:00+00:00',
      },
    ]);
  allow();
});

describe('task comment routes', () => {
  it('lists live comments oldest first with their authors', async () => {
    const response = await handleTaskCommentsGET(request('GET'), taskCtx);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.comments.map((c: { id: string }) => c.id)).toEqual([C1, C2]);
    expect(body.comments[1].author).toMatchObject({
      id: OTHER,
      display_name: 'Other',
    });
    expect(body.nextCursor).toBeNull();
  });

  it('pages with an opaque cursor', async () => {
    const response = await handleTaskCommentsGET(
      request('GET', undefined, '?limit=1'),
      taskCtx
    );
    const body = await response.json();
    expect(body.comments).toHaveLength(1);
    expect(typeof body.nextCursor).toBe('string');
  });

  it('rejects a cursor it did not issue and an oversized limit', async () => {
    const bad = await handleTaskCommentsGET(
      request('GET', undefined, '?cursor=not-a-cursor'),
      taskCtx
    );
    expect(bad.status).toBe(400);
    const big = await handleTaskCommentsGET(
      request('GET', undefined, '?limit=101'),
      taskCtx
    );
    expect(big.status).toBe(400);
  });

  it('passes an access denial straight through without reading', async () => {
    mocks.requireTaskScope.mockResolvedValue({
      error: NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      ),
    });
    const response = await handleTaskCommentsGET(request('GET'), taskCtx);
    expect(response.status).toBe(403);
    const post = await handleTaskCommentsPOST(
      request('POST', { body: 'x' }),
      taskCtx
    );
    expect(post.status).toBe(403);
    expect(db.rows('private.task_comments')).toHaveLength(3);
  });

  it('creates a comment authored by the caller', async () => {
    const response = await handleTaskCommentsPOST(
      request('POST', { body: 'hello' }),
      taskCtx
    );
    const body = await response.json();
    expect(response.status).toBe(201);
    expect(body.comment).toMatchObject({ body: 'hello', author: { id: ME } });
    const stored = db.rows('private.task_comments').at(-1);
    expect(stored).toMatchObject({ author_id: ME, task_id: TASK, ws_id: WS });
  });

  it('rejects blank and oversized bodies', async () => {
    expect(
      (await handleTaskCommentsPOST(request('POST', { body: '   ' }), taskCtx))
        .status
    ).toBe(400);
    expect(
      (
        await handleTaskCommentsPOST(
          request('POST', { body: 'x'.repeat(65537) }),
          taskCtx
        )
      ).status
    ).toBe(400);
  });

  it('lets only the author edit', async () => {
    const denied = await handleTaskCommentPATCH(
      request('PATCH', { body: 'x' }),
      commentCtx(C2)
    );
    expect(denied.status).toBe(403);
    const ok = await handleTaskCommentPATCH(
      request('PATCH', { body: 'edited' }),
      commentCtx(C1)
    );
    expect(ok.status).toBe(200);
    expect(db.rows('private.task_comments')[0]).toMatchObject({
      body: 'edited',
      updated_by: ME,
    });
    expect(db.rows('private.task_comments')[0]?.edited_at).toBeTruthy();
  });

  it('does not edit imported or deleted comments', async () => {
    expect(
      (
        await handleTaskCommentPATCH(
          request('PATCH', { body: 'x' }),
          commentCtx(C3)
        )
      ).status
    ).toBe(404);
    db.rows('private.task_comments')[1]!.author_id = null;
    expect(
      (
        await handleTaskCommentPATCH(
          request('PATCH', { body: 'x' }),
          commentCtx(C2)
        )
      ).status
    ).toBe(403);
  });

  it('soft deletes for the author and for a moderator, not for others', async () => {
    expect(
      (await handleTaskCommentDELETE(request('DELETE'), commentCtx(C2))).status
    ).toBe(403);
    expect(
      (await handleTaskCommentDELETE(request('DELETE'), commentCtx(C1))).status
    ).toBe(200);
    const mine = db.rows('private.task_comments')[0]!;
    expect(mine.deleted_at).toBeTruthy();
    expect(mine.updated_by).toBe(ME);

    mocks.canManage.mockResolvedValue(true);
    expect(
      (await handleTaskCommentDELETE(request('DELETE'), commentCtx(C2))).status
    ).toBe(200);
    expect(db.rows('private.task_comments')[1]?.deleted_at).toBeTruthy();
    expect(
      (await handleTaskCommentDELETE(request('DELETE'), commentCtx(C2))).status
    ).toBe(404);
  });

  it('does not reach a comment through another task', async () => {
    db.rows('private.task_comments')[0]!.task_id =
      '66666666-6666-4666-8666-666666666666';
    expect(
      (await handleTaskCommentDELETE(request('DELETE'), commentCtx(C1))).status
    ).toBe(404);
  });
});
