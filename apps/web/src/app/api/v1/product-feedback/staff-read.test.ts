// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { StaffReadError } from './staff-access';
import {
  createStaffDetailHandler,
  createStaffListHandler,
  parseStaffQuery,
  type StaffQuery,
  type StaffReadDependencies,
} from './staff-read';

const actor = '91600000-0000-4000-8000-000000000001';
const id = (n: number) =>
  `91600000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const time = '2026-10-07T17:00:00.000001Z';
const row = (n = 3) => ({
  id: id(n),
  title: 'Synthetic title',
  createdAt: time,
  status: 'open' as const,
  archivedAt: null,
  revision: 0,
});
const request = (query = '') =>
  new Request(`https://feedback.example.test/api/v1/product-feedback${query}`);
function deps(
  overrides: Partial<StaffReadDependencies> = {}
): StaffReadDependencies {
  return {
    actor: vi.fn(async () => actor),
    enabled: () => true,
    list: vi.fn(async () => ({ items: [row()] })),
    detail: vi.fn(async () => ({
      ...row(),
      body: 'Private synthetic body',
      updatedAt: time,
      capabilities: { canManage: false },
    })),
    ...overrides,
  };
}
async function privateResponse(response: Response, status: number) {
  expect(response.status).toBe(status);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.get('vary')).toBe('Authorization, Cookie');
  return response.json();
}
describe('owned list and detail handlers', () => {
  it('returns only projected list fields; detail alone carries private plain text', async () => {
    const d = deps();
    expect(
      await privateResponse(await createStaffListHandler(d)(request()), 200)
    ).toEqual({ items: [row()], nextCursor: null });
    expect(
      await privateResponse(
        await createStaffDetailHandler(d)(request(), id(3)),
        200
      )
    ).toEqual({
      ...row(),
      body: 'Private synthetic body',
      updatedAt: time,
      capabilities: { canManage: false },
    });
  });
  it.each([401, 403, 503] as const)(
    'admission %s precedes malformed filter and store',
    async (status) => {
      const d = deps({
        actor: async () => {
          throw new StaffReadError(status);
        },
      });
      await privateResponse(
        await createStaffListHandler(d)(request('?limit=bad')),
        status
      );
      await privateResponse(
        await createStaffDetailHandler(d)(request(), 'bad-id'),
        status
      );
      expect(d.list).not.toHaveBeenCalled();
      expect(d.detail).not.toHaveBeenCalled();
    }
  );
  it('read flag OFF denies list/detail independently of intake state', async () => {
    const d = deps({ enabled: () => false });
    await privateResponse(await createStaffListHandler(d)(request()), 503);
    await privateResponse(
      await createStaffDetailHandler(d)(request(), id(3)),
      503
    );
    expect(d.list).not.toHaveBeenCalled();
    expect(d.detail).not.toHaveBeenCalled();
  });
  it.each(['pending', 'provisioned', 'missing', 'mismatch', 'deactivated'])(
    'final SQL denial %s is preserved, including detail',
    async () => {
      // Inject the protected SQL operation's denial; real registry predicate proof is in unexecuted TAP.
      const deny = async () => {
        throw new StaffReadError(403);
      };
      const d = deps({ list: deny, detail: deny });
      await privateResponse(await createStaffListHandler(d)(request()), 403);
      await privateResponse(
        await createStaffDetailHandler(d)(request(), id(3)),
        403
      );
    }
  );
  it.each([
    null,
    {},
    { items: [{ ...row(), reporterEmail: 'PRIVATE_IDENTITY' }] },
    { items: [{ ...row(), body: 'PRIVATE_BODY' }] },
  ])('malformed/private list output fails closed %j', async (raw) => {
    const d = deps({ list: async () => raw });
    const body = await privateResponse(
      await createStaffListHandler(d)(request()),
      503
    );
    expect(JSON.stringify(body)).not.toContain('PRIVATE');
  });
  it('store outage never becomes empty200 or logs private body', async () => {
    const log = vi.spyOn(console, 'error');
    const d = deps({
      list: async () => {
        throw new Error('PRIVATE_BODY');
      },
    });
    await privateResponse(await createStaffListHandler(d)(request()), 503);
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
  it('eligible missing detail is404; ineligible missing stays403', async () => {
    await privateResponse(
      await createStaffDetailHandler(deps({ detail: async () => null }))(
        request(),
        id(3)
      ),
      404
    );
    await privateResponse(
      await createStaffDetailHandler(
        deps({
          actor: async () => {
            throw new StaffReadError(403);
          },
        })
      )(request(), id(3)),
      403
    );
  });
  it.each(['bad', `${id(3)}?bad`, ''])(
    'rejects invalid detail id %j',
    async (value) => {
      const d = deps();
      await privateResponse(
        await createStaffDetailHandler(d)(request(), value),
        400
      );
      expect(d.detail).not.toHaveBeenCalled();
    }
  );
  it.each([
    {
      ...row(),
      updatedAt: time,
      body: 'private',
      capabilities: { canManage: true },
    },
    {
      ...row(),
      updatedAt: time,
      body: 'private',
      capabilities: { canManage: false },
      actor_id: actor,
    },
  ])('rejects unauthorized detail output', async (raw) => {
    await privateResponse(
      await createStaffDetailHandler(deps({ detail: async () => raw }))(
        request(),
        id(3)
      ),
      503
    );
  });
  it.each([
    '?limit=0',
    '?limit=51',
    '?limit=1.5',
    '?limit=1e1',
    '?limit=01',
    '?limit=NaN',
    '?limit=9999999999999999',
    '?view=unknown',
    '?view=inbox&status=open',
    '?view=resolved&status=resolved',
    '?status=unknown',
    '?limit=2&limit=3',
    '?q=a&q=b',
    '?actor=spoof',
    '?cursor=',
    '?cursor=bad!',
    '?q=%00',
    `?q=${'a'.repeat(161)}`,
  ])('rejects strict/bounded query %s', async (query) => {
    const d = deps();
    await privateResponse(await createStaffListHandler(d)(request(query)), 400);
    expect(d.list).not.toHaveBeenCalled();
  });
  it('passes literal title query and bounded filter to store', async () => {
    const d = deps({ list: vi.fn(async () => ({ items: [] })) });
    await privateResponse(
      await createStaffListHandler(d)(
        request('?view=archive&status=resolved&q=%20%25_%5C%20&limit=50')
      ),
      200
    );
    expect(d.list).toHaveBeenCalledWith(actor, {
      view: 'archive',
      status: 'resolved',
      q: '%_\\',
      limit: 50,
      before: null,
    });
    expect(
      parseStaffQuery(request(`?q=${'😀'.repeat(160)}`).url).q
    ).toHaveLength(320);
  });
  it('uses tied timestamp/id keyset, limit+1 and filter-bound cursor; insert cannot duplicate page1', async () => {
    let data = [row(3), row(2), row(1)];
    const list = vi.fn(async (_actor: string, query: StaffQuery) => ({
      items: data
        .filter((r) => !query.before || r.id < query.before.id)
        .slice(0, query.limit + 1),
    }));
    const handler = createStaffListHandler(deps({ list }));
    const first = await privateResponse(
      await handler(request('?limit=2&q=title')),
      200
    );
    expect(first.items.map((r: { id: string }) => r.id)).toEqual([
      id(3),
      id(2),
    ]);
    expect(first.nextCursor).toBeTypeOf('string');
    data = [row(4), ...data];
    const second = await privateResponse(
      await handler(request(`?limit=2&q=title&cursor=${first.nextCursor}`)),
      200
    );
    expect(second).toEqual({ items: [row(1)], nextCursor: null });
    for (const changed of [
      'view=all&q=title',
      'q=changed',
      'view=archive&status=open&q=title',
    ])
      await privateResponse(
        await handler(request(`?${changed}&cursor=${first.nextCursor}`)),
        400
      );
    expect(list.mock.calls[1]![1].before).toEqual({
      createdAt: time,
      id: id(2),
    });
  });
  it('strict cursor rejects extra fields/version/id/date/oversize/noncanonical encoding', async () => {
    const baseline = {
      v: 1,
      view: 'inbox',
      status: null,
      q: '',
      createdAt: time,
      id: id(2),
    };
    for (const changed of [
      { v: 2 },
      { id: 'bad' },
      { createdAt: 'not-date' },
      { privateBody: 'secret' },
      { q: 'changed' },
    ]) {
      const cursor = Buffer.from(
        JSON.stringify({ ...baseline, ...changed })
      ).toString('base64url');
      await privateResponse(
        await createStaffListHandler(deps())(request(`?cursor=${cursor}`)),
        400
      );
    }
    await privateResponse(
      await createStaffListHandler(deps())(
        request(`?cursor=${'a'.repeat(1153)}`)
      ),
      400
    );
  });
  it('honors microseconds when IDs run opposite to time; rejects wrong tie order', async () => {
    const newer = { ...row(1), createdAt: '2026-10-07T17:00:00.000002Z' };
    await privateResponse(
      await createStaffListHandler(
        deps({ list: async () => ({ items: [newer, row(3)] }) })
      )(request()),
      200
    );
    await privateResponse(
      await createStaffListHandler(
        deps({ list: async () => ({ items: [row(1), row(3)] }) })
      )(request()),
      503
    );
    await privateResponse(
      await createStaffListHandler(
        deps({ list: async () => ({ items: [row(3), row(3)] }) })
      )(request()),
      503
    );
  });
  it.each([
    ['inbox', { ...row(), status: 'resolved' }],
    ['resolved', row()],
    ['archive', row()],
  ])('rejects store membership mismatch for %s', async (view, item) => {
    await privateResponse(
      await createStaffListHandler(
        deps({ list: async () => ({ items: [item] }) })
      )(request(`?view=${view}`)),
      503
    );
  });
  it('archive and resolution remain orthogonal; all admits both', async () => {
    const archived = { ...row(), status: 'resolved', archivedAt: time };
    for (const query of ['?view=archive&status=resolved', '?view=all'])
      await privateResponse(
        await createStaffListHandler(
          deps({ list: async () => ({ items: [archived] }) })
        )(request(query)),
        200
      );
  });
  it('continues a maximal Unicode query with the exact archive filters and position', async () => {
    const d = deps({
      list: async () => ({
        items: [
          { ...row(3), archivedAt: time, status: 'resolved' },
          { ...row(2), archivedAt: time, status: 'resolved' },
        ],
      }),
    });
    const query = `?view=archive&status=resolved&limit=1&q=${String.fromCodePoint(0x1f600).repeat(160)}`;
    const body = await privateResponse(
      await createStaffListHandler(d)(request(query)),
      200
    );
    expect(Buffer.byteLength(body.nextCursor, 'utf8')).toBeGreaterThan(1024);
    expect(Buffer.byteLength(body.nextCursor, 'utf8')).toBeLessThanOrEqual(
      1152
    );
    const continuation = parseStaffQuery(
      request(`${query}&cursor=${body.nextCursor}`).url
    );
    expect(continuation).toMatchObject({
      view: 'archive',
      status: 'resolved',
      q: String.fromCodePoint(0x1f600).repeat(160),
      before: { createdAt: time, id: row(3).id },
    });
    d.list = vi.fn().mockResolvedValue({
      items: [{ ...row(2), archivedAt: time, status: 'resolved' }],
    });
    const next = await privateResponse(
      await createStaffListHandler(d)(
        request(`${query}&cursor=${body.nextCursor}`)
      ),
      200
    );
    expect(next.items).toHaveLength(1);
    expect(next.nextCursor).toBeNull();
    expect(d.list).toHaveBeenCalledWith(actor, continuation);
  });
});
