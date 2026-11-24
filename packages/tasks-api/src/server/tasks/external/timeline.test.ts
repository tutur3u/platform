import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeCursor, encodeCursor, keysetFilter } from './cursor';
import { FakeDb } from './fake-db.test-support';

const WS = '22222222-2222-4222-8222-222222222222';
const TASK = '33333333-3333-4333-8333-333333333333';
const ME = '11111111-1111-4111-8111-111111111111';
const C1 = '55555555-5555-4555-8555-555555555551';
const C2 = '55555555-5555-4555-8555-555555555552';

const mocks = vi.hoisted(() => ({ requireTaskScope: vi.fn() }));
vi.mock('./access', () => ({
  jsonError: (message: string, status: number) =>
    NextResponse.json({ error: message }, { status }),
  requireTaskScope: mocks.requireTaskScope,
}));
vi.mock('@tuturuuu/utils/co-member-names', () => ({
  resolveCoMemberNames: async () => new Map(),
}));

import { handleTaskTimelineGET } from './timeline';

let db: FakeDb;
const ctx = { params: Promise.resolve({ wsId: WS, taskId: TASK }) };
const get = (query = '') =>
  handleTaskTimelineGET(
    new NextRequest(`http://localhost/timeline${query}`),
    ctx
  );

beforeEach(() => {
  vi.clearAllMocks();
  db = new FakeDb()
    .seed('users', [
      { id: ME, display_name: 'Me', handle: 'me', avatar_url: null },
    ])
    .seed('task_history', [
      {
        id: 'a0000000-0000-4000-8000-000000000001',
        task_id: TASK,
        change_type: 'external_imported',
        changed_at: '2026-11-24T10:00:00Z',
        changed_by: ME,
        field_name: 'external',
        old_value: null,
        new_value: null,
        metadata: { url: 'https://github.com/o/r/issues/1' },
        deleted_at: null,
      },
      {
        id: 'a0000000-0000-4000-8000-000000000002',
        task_id: TASK,
        change_type: 'external_event',
        changed_at: '2023-05-02T07:00:00Z',
        changed_by: null,
        field_name: 'state',
        old_value: 'open',
        new_value: 'closed',
        metadata: { external_actor: 'octocat' },
        deleted_at: null,
      },
      {
        id: 'a0000000-0000-4000-8000-000000000003',
        task_id: TASK,
        change_type: 'comment_added',
        changed_at: '2023-05-01T08:00:00Z',
        changed_by: null,
        field_name: 'comment',
        old_value: null,
        new_value: null,
        metadata: { comment_id: C1, external_author: 'octocat' },
        deleted_at: null,
      },
      {
        id: 'a0000000-0000-4000-8000-000000000004',
        task_id: TASK,
        change_type: 'comment_added',
        changed_at: '2023-05-01T09:00:00Z',
        changed_by: ME,
        field_name: 'comment',
        old_value: null,
        new_value: null,
        metadata: { comment_id: C2 },
        deleted_at: null,
      },
      {
        id: 'a0000000-0000-4000-8000-000000000005',
        task_id: '99999999-9999-4999-8999-999999999999',
        change_type: 'field_updated',
        changed_at: '2024-01-01T00:00:00Z',
        changed_by: ME,
        field_name: 'name',
        old_value: 'a',
        new_value: 'b',
        metadata: {},
        deleted_at: null,
      },
    ])
    .seed('private.task_comments', [
      {
        id: C1,
        task_id: TASK,
        ws_id: WS,
        author_id: null,
        external_author: 'octocat',
        external_url: 'https://github.com/o/r/issues/1#c',
        body: 'Imported words',
        created_at: '2023-05-01T08:00:00Z',
        edited_at: null,
        deleted_at: null,
      },
      {
        id: C2,
        task_id: TASK,
        ws_id: WS,
        author_id: ME,
        external_author: null,
        external_url: null,
        body: 'Deleted words',
        created_at: '2023-05-01T09:00:00Z',
        edited_at: null,
        deleted_at: '2024-01-01T00:00:00Z',
      },
    ]);
  mocks.requireTaskScope.mockImplementation(async () => ({
    access: { mode: 'member', permission: 'view' },
    admin: db,
    taskId: TASK,
    user: { id: ME },
    wsId: WS,
  }));
});

describe('task timeline route', () => {
  it('lists this task only, newest first, including the new change types', async () => {
    const { events } = await (await get()).json();
    expect(events.map((e: { type: string }) => e.type)).toEqual([
      'external_imported',
      'external_event',
      'comment_added',
      'comment_added',
    ]);
    expect(events).toHaveLength(4);
  });

  it('attaches live comment bodies and omits deleted ones', async () => {
    const { events } = await (await get()).json();
    const imported = events.find(
      (e: { metadata: { comment_id?: string } }) => e.metadata.comment_id === C1
    );
    expect(imported.comment).toMatchObject({
      id: C1,
      body: 'Imported words',
      external_author: 'octocat',
    });
    expect(imported.external_actor).toBe('octocat');
    const deleted = events.find(
      (e: { metadata: { comment_id?: string } }) => e.metadata.comment_id === C2
    );
    expect(deleted.comment).toBeUndefined();
    expect(deleted.actor).toMatchObject({ id: ME });
  });

  it('reads the external actor from event metadata', async () => {
    const { events } = await (await get()).json();
    const event = events.find(
      (e: { type: string }) => e.type === 'external_event'
    );
    expect(event).toMatchObject({
      external_actor: 'octocat',
      actor: null,
      old_value: 'open',
      new_value: 'closed',
    });
  });

  it('never returns a comment body from history metadata and passes denials through', async () => {
    mocks.requireTaskScope.mockResolvedValue({
      error: NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      ),
    });
    expect((await get()).status).toBe(403);
  });

  it('pages and rejects bad cursors', async () => {
    const page = await (await get('?limit=2')).json();
    expect(page.events).toHaveLength(2);
    expect(page.nextCursor).toBeTruthy();
    expect((await get('?cursor=%25%25')).status).toBe(400);
    expect((await get('?limit=0')).status).toBe(400);
  });
});

describe('cursor', () => {
  const cursor = {
    at: '2023-05-01T08:00:00.123456+00:00',
    id: 'a0000000-0000-4000-8000-000000000003',
  };
  it('round-trips and only accepts its own shape', () => {
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
    expect(decodeCursor(null)).toBeNull();
    expect(
      decodeCursor(Buffer.from('["x\\"),id.gt.0","y"]').toString('base64url'))
    ).toBeNull();
  });
  it('builds a keyset filter from validated parts', () => {
    expect(keysetFilter('created_at', cursor, 'asc')).toBe(
      `created_at.gt."${cursor.at}",and(created_at.eq."${cursor.at}",id.gt.${cursor.id})`
    );
    expect(keysetFilter('changed_at', cursor, 'desc')).toContain(
      'changed_at.lt.'
    );
  });
});
