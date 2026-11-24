import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeDb } from './fake-db.test-support';
import { inferTaskLink } from './github-links';

const WS = '22222222-2222-4222-8222-222222222222';
const TASK = '33333333-3333-4333-8333-333333333333';
const ME = '11111111-1111-4111-8111-111111111111';
const L1 = '77777777-7777-4777-8777-777777777771';

const mocks = vi.hoisted(() => ({ requireTaskScope: vi.fn() }));
vi.mock('./access', () => ({
  jsonError: (message: string, status: number) =>
    NextResponse.json({ error: message }, { status }),
  requireTaskScope: mocks.requireTaskScope,
}));

import {
  handleTaskLinkDELETE,
  handleTaskLinksGET,
  handleTaskLinksPOST,
  mergeLegacyResources,
} from './links';

let db: FakeDb;
const ctx = { params: Promise.resolve({ wsId: WS, taskId: TASK }) };
const request = (method: string, body?: unknown) =>
  new NextRequest('http://localhost/links', {
    method,
    ...(body === undefined
      ? {}
      : {
          body: JSON.stringify(body),
          headers: { 'content-type': 'application/json' },
        }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  db = new FakeDb()
    .seed('tasks', [
      {
        id: TASK,
        task_resources: [
          { kind: 'link', url: 'https://legacy.example/doc', title: 'Legacy' },
          { kind: 'link', url: 'https://github.com/o/r/pull/7', title: 'dup' },
        ],
      },
    ])
    .seed('private.task_links', [
      {
        id: L1,
        task_id: TASK,
        ws_id: WS,
        kind: 'pull_request',
        provider: 'github',
        url: 'https://github.com/o/r/pull/7',
        external_id: 'o/r#7',
        title: 'Fix',
        state: 'open',
        created_at: '2024-01-01T00:00:00Z',
        created_by: ME,
        removed_at: null,
      },
    ]);
  db.uniques.set('private.task_links', (row, rows) =>
    rows.some(
      (r) =>
        r.task_id === row.task_id &&
        r.url === row.url &&
        (r.removed_at ?? null) === null
    )
  );
  mocks.requireTaskScope.mockImplementation(async () => ({
    access: { mode: 'member', permission: 'edit' },
    admin: db,
    taskId: TASK,
    user: { id: ME },
    wsId: WS,
  }));
});

describe('inferTaskLink', () => {
  it.each([
    ['https://github.com/o/r/pull/7', 'pull_request', 'github', 'o/r#7'],
    ['https://github.com/o/r/issues/12', 'issue', 'github', 'o/r#12'],
    [
      'https://github.com/o/r/commit/ABCDEF1234567',
      'commit',
      'github',
      'o/r@abcdef1234567',
    ],
    [
      'https://github.com/o/r/actions/runs/998877',
      'ci_run',
      'github',
      'o/r/runs/998877',
    ],
    ['https://github.com/o/r', 'url', 'web', null],
    ['https://github.com/o/r/pull/abc', 'url', 'web', null],
    ['https://gist.github.com/o/r/pull/7', 'url', 'web', null],
    ['https://example.com/o/r/pull/7', 'url', 'web', null],
    ['not a url', 'url', 'web', null],
  ])('classifies %s', (url, kind, provider, externalId) => {
    expect(inferTaskLink(url)).toEqual({ kind, provider, externalId });
  });
});

describe('task link routes', () => {
  it('merges legacy resources under the rich rows', async () => {
    const response = await handleTaskLinksGET(request('GET'), ctx);
    const { links } = await response.json();
    expect(links).toHaveLength(2);
    expect(links[0]).toMatchObject({ id: L1, kind: 'pull_request' });
    expect(links[1]).toMatchObject({
      id: null,
      kind: 'url',
      provider: 'web',
      legacy: true,
      title: 'Legacy',
    });
  });

  it('ignores malformed legacy entries', () => {
    expect(
      mergeLegacyResources(
        [],
        [null, 3, { kind: 'doc', url: 'https://x' }, { kind: 'link' }]
      )
    ).toEqual([]);
    expect(mergeLegacyResources([], 'nope')).toEqual([]);
  });

  it('hides removed links; a legacy entry for the same URL then shows as legacy', async () => {
    db.rows('private.task_links')[0]!.removed_at = '2024-02-01T00:00:00Z';
    const { links } = await (
      await handleTaskLinksGET(request('GET'), ctx)
    ).json();
    expect(links.every((l: { id: string | null }) => l.id === null)).toBe(true);
    expect(links.map((l: { url: string }) => l.url)).toEqual([
      'https://legacy.example/doc',
      'https://github.com/o/r/pull/7',
    ]);
  });

  it('infers kind and provider from a GitHub URL and ignores the client kind', async () => {
    const response = await handleTaskLinksPOST(
      request('POST', {
        url: 'https://github.com/o/r/commit/abcdef1',
        kind: 'doc',
        title: 'Commit',
      }),
      ctx
    );
    expect(response.status).toBe(201);
    const { link } = await response.json();
    expect(link).toMatchObject({
      kind: 'commit',
      provider: 'github',
      external_id: 'o/r@abcdef1',
      title: 'Commit',
    });
    expect(db.rows('private.task_links').at(-1)).toMatchObject({
      created_by: ME,
      ws_id: WS,
      task_id: TASK,
    });
  });

  it('stores other URLs as web links and honors a doc kind', async () => {
    const response = await handleTaskLinksPOST(
      request('POST', { url: 'https://example.com/spec', kind: 'doc' }),
      ctx
    );
    expect((await response.json()).link).toMatchObject({
      kind: 'doc',
      provider: 'web',
    });
  });

  it('upserts on the active (task, url)', async () => {
    const response = await handleTaskLinksPOST(
      request('POST', {
        url: 'https://github.com/o/r/pull/7',
        state: 'merged',
      }),
      ctx
    );
    expect(response.status).toBe(200);
    expect(db.rows('private.task_links')).toHaveLength(1);
    expect(db.rows('private.task_links')[0]).toMatchObject({
      state: 'merged',
      title: 'Fix',
    });
  });

  it('rejects non-https and malformed URLs', async () => {
    expect(
      (
        await handleTaskLinksPOST(
          request('POST', { url: 'http://example.com' }),
          ctx
        )
      ).status
    ).toBe(400);
    expect(
      (
        await handleTaskLinksPOST(
          request('POST', { url: 'javascript:alert(1)' }),
          ctx
        )
      ).status
    ).toBe(400);
    expect((await handleTaskLinksPOST(request('POST', {}), ctx)).status).toBe(
      400
    );
  });

  it('requires edit rights to add or remove and passes denials through', async () => {
    mocks.requireTaskScope.mockResolvedValue({
      error: NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      ),
    });
    expect(
      (
        await handleTaskLinksPOST(
          request('POST', { url: 'https://example.com' }),
          ctx
        )
      ).status
    ).toBe(403);
    expect(
      (
        await handleTaskLinkDELETE(request('DELETE'), {
          params: Promise.resolve({ wsId: WS, taskId: TASK, linkId: L1 }),
        })
      ).status
    ).toBe(403);
    expect(
      mocks.requireTaskScope.mock.calls.every(
        (call) => call[3]?.permission === 'edit'
      )
    ).toBe(true);
    expect(db.rows('private.task_links')).toHaveLength(1);
  });

  it('soft removes once and then 404s', async () => {
    const deleteCtx = {
      params: Promise.resolve({ wsId: WS, taskId: TASK, linkId: L1 }),
    };
    expect(
      (await handleTaskLinkDELETE(request('DELETE'), deleteCtx)).status
    ).toBe(200);
    expect(db.rows('private.task_links')[0]).toMatchObject({ removed_by: ME });
    expect(db.rows('private.task_links')[0]?.removed_at).toBeTruthy();
    expect(
      (await handleTaskLinkDELETE(request('DELETE'), deleteCtx)).status
    ).toBe(404);
  });

  it('can link a removed URL again', async () => {
    db.rows('private.task_links')[0]!.removed_at = '2024-02-01T00:00:00Z';
    const response = await handleTaskLinksPOST(
      request('POST', { url: 'https://github.com/o/r/pull/7' }),
      ctx
    );
    expect(response.status).toBe(201);
    expect(db.rows('private.task_links')).toHaveLength(2);
  });
});
