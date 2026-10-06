import { readFileSync } from 'node:fs';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const mocks = vi.hoisted(() => ({ sql: vi.fn(), serve: vi.fn() }));
vi.mock('postgres', () => ({ default: () => mocks.sql }));

let fetchHandler: (request: Request) => Promise<Response>;
beforeAll(async () => {
  vi.stubEnv(
    'SUPERMEMORY_DATABASE_URL',
    'postgresql://synthetic.invalid/fixture'
  );
  vi.stubEnv('SUPERMEMORY_API_KEY', 'synthetic-test-only');
  vi.stubGlobal('Bun', { serve: mocks.serve });
  await import('./server.js');
  fetchHandler = mocks.serve.mock.calls[0]![0].fetch;
});
afterAll(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

beforeEach(() => mocks.sql.mockReset());
const revision = `v1:${'a'.repeat(32)}`;
const nextRevision = `v1:${'b'.repeat(32)}`;
const scope = {
  id: 'synthetic-memory',
  containerTag: 'synthetic-container',
  userId: 'synthetic-actor',
  wsId: 'synthetic-workspace',
  product: 'mira',
};
function request(path: string, body: unknown) {
  return new Request(`http://memory.test${path}`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer synthetic-test-only',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

describe('actual sidecar edit routes', () => {
  it('reads an owned active memory with an opaque edit revision', async () => {
    mocks.sql.mockResolvedValueOnce([
      { id: scope.id, content: 'Synthetic original', revision },
    ]);
    const response = await fetchHandler(request('/v1/memories/read', scope));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      memory: { id: scope.id, revision },
    });
  });

  it('updates content/vector with a scoped revision-CAS receipt', async () => {
    mocks.sql.mockResolvedValueOnce([
      { id: scope.id, content: 'Synthetic edited', revision: nextRevision },
    ]);
    const response = await fetchHandler(
      request('/v1/memories/update', {
        ...scope,
        content: 'Synthetic edited',
        revision,
        embedding: Array.from({ length: 3072 }, () => 0.1),
      })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      updated: true,
      memory: { id: scope.id, revision: nextRevision },
    });
  });
  it('binds every ownership predicate and full-precision opaque revision in actual SQL', async () => {
    mocks.sql.mockResolvedValueOnce([{ id: scope.id, revision }]);
    await fetchHandler(request('/v1/memories/read', scope));
    const [readStrings, ...readValues] = mocks.sql.mock.calls[0]!;
    const readSql = readStrings.join('?');
    for (const field of [
      'id =',
      'container_tag =',
      "metadata ->> 'userId' =",
      "metadata ->> 'wsId' =",
      "metadata ->> 'product' =",
      "status = 'done'",
    ]) {
      expect(readSql).toContain(field);
    }
    expect(readSql).toContain('extract(epoch from updated_at)::text');
    expect(readSql).not.toContain('millisecond');
    expect(readSql).toContain('ctid::text');
    expect(readValues).toEqual([
      scope.id,
      scope.containerTag,
      scope.userId,
      scope.wsId,
      scope.product,
    ]);
    mocks.sql.mockResolvedValueOnce([{ id: scope.id, revision: nextRevision }]);
    await fetchHandler(
      request('/v1/memories/update', {
        ...scope,
        content: 'Edited',
        revision,
        embedding: Array.from({ length: 3072 }, () => 0.1),
      })
    );
    const [updateStrings, ...updateValues] = mocks.sql.mock.calls[1]!;
    const updateSql = updateStrings.join('?');
    expect(updateSql).toContain('update public.memories');
    expect(updateSql).toContain('embedding =');
    expect(updateSql).toContain('summary = null');
    expect(updateSql).toContain('extract(epoch from updated_at)::text');
    expect(updateSql.match(/ctid::text/g)).toHaveLength(2);
    const setClause = updateSql.split('    where')[0]!;
    expect(setClause).not.toMatch(/(?:id|metadata|custom_id|created_at)\s*=/);
    expect(updateValues.slice(2)).toEqual([
      scope.id,
      scope.containerTag,
      scope.userId,
      scope.wsId,
      scope.product,
      revision,
    ]);
  });

  it('returns non-enumerating missing and conflict receipts for unmatched SQL rows', async () => {
    mocks.sql.mockResolvedValue([]);
    expect(
      (await fetchHandler(request('/v1/memories/read', scope))).status
    ).toBe(404);
    const response = await fetchHandler(
      request('/v1/memories/update', {
        ...scope,
        content: 'Edited',
        revision,
        embedding: Array.from({ length: 3072 }, () => 0.1),
      })
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Memory edit conflict' });
  });

  it('requires service authentication before any SQL access', async () => {
    const response = await fetchHandler(
      new Request('http://memory.test/v1/memories/read', {
        method: 'POST',
        body: JSON.stringify(scope),
      })
    );
    expect(response.status).toBe(401);
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it('requires complete scope and valid finite 3072-dimensional edits', async () => {
    for (const body of [
      { ...scope, userId: '' },
      { ...scope, content: '', revision, embedding: [] },
      { ...scope, content: 'Edited', revision: 'invalid', embedding: [] },
      { ...scope, content: 'Edited', revision, embedding: [0.1] },
      {
        ...scope,
        content: 'Edited',
        revision,
        embedding: Array.from({ length: 3072 }, () => '0.1'),
      },
    ]) {
      const response = await fetchHandler(request('/v1/memories/update', body));
      expect(response.status).toBe(400);
    }
    expect(mocks.sql).not.toHaveBeenCalled();
  });

  it('edit surface errors do not expose SQL/private content', async () => {
    mocks.sql.mockRejectedValueOnce(new Error('Synthetic private SQL payload'));
    const response = await fetchHandler(request('/v1/memories/read', scope));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'Memory service request failed',
    });
  });

  it('schema and migration runner define the update timestamp trigger', () => {
    const schema = readFileSync(
      new URL('../db/001_schema.sql', import.meta.url),
      'utf8'
    );
    expect(schema).toContain('new.updated_at = now()');
    expect(schema).toContain('before update on public.memories');
    const runner = readFileSync(
      new URL('../db/migrate-forward.sh', import.meta.url),
      'utf8'
    );
    expect(runner).toContain(
      '-v ON_ERROR_STOP=1 -f /supermemory-db/001_schema.sql'
    );
  });

  it('new private read surface rejects an unconfigured service key', async () => {
    vi.stubEnv('SUPERMEMORY_API_KEY', '');
    vi.resetModules();
    await import('./server.js');
    const handler = mocks.serve.mock.calls.at(-1)![0].fetch;
    expect((await handler(request('/v1/memories/read', scope))).status).toBe(
      401
    );
    expect(mocks.sql).not.toHaveBeenCalled();
  });
});
