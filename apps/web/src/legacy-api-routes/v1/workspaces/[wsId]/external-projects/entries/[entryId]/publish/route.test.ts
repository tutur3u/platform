import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  publishWorkspaceExternalProjectEntry: vi.fn(),
  requireWorkspaceExternalProjectAccess: vi.fn(),
}));

vi.mock('@/lib/external-projects/access', () => ({
  requireWorkspaceExternalProjectAccess: (
    ...args: Parameters<typeof mocks.requireWorkspaceExternalProjectAccess>
  ) => mocks.requireWorkspaceExternalProjectAccess(...args),
}));

vi.mock('@/lib/external-projects/store', () => ({
  publishWorkspaceExternalProjectEntry: (
    ...args: Parameters<typeof mocks.publishWorkspaceExternalProjectEntry>
  ) => mocks.publishWorkspaceExternalProjectEntry(...args),
}));

const workspaceId = '123e4567-e89b-12d3-a456-426614174000';
const entryId = '223e4567-e89b-12d3-a456-426614174000';
const draftEntry = { id: entryId, status: 'draft', ws_id: workspaceId };

/** Records every table and query method the route touches. */
function createRecordingDb(row: Record<string, unknown> | null) {
  const calls: string[] = [];
  const query: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'update', 'insert', 'upsert']) {
    query[method] = vi.fn((...args: unknown[]) => {
      calls.push(`${method}:${JSON.stringify(args)}`);
      return query;
    });
  }
  query.maybeSingle = vi.fn(async () => {
    calls.push('maybeSingle');
    return { data: row, error: null };
  });
  const from = vi.fn((table: string) => {
    calls.push(`from:${table}`);
    return query;
  });
  return { calls, db: { from } };
}

async function post(eventKind: string) {
  const { POST } = await import('./route');
  return POST(
    new Request(
      `https://tuturuuu.com/api/v1/workspaces/${workspaceId}/external-projects/entries/${entryId}/publish`,
      { body: JSON.stringify({ eventKind }), method: 'POST' }
    ),
    { params: Promise.resolve({ entryId, wsId: workspaceId }) }
  );
}

function grantAccess(db: unknown) {
  mocks.requireWorkspaceExternalProjectAccess.mockResolvedValue({
    admin: db,
    binding: { canonical_id: 'canonical-project' },
    normalizedWorkspaceId: workspaceId,
    ok: true,
    user: { id: 'actor' },
  });
}

describe('legacy entry publish route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('previews an entry read-only: no status write and no publish event', async () => {
    const { calls, db } = createRecordingDb(draftEntry);
    grantAccess(db);

    const response = await post('preview');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(draftEntry);
    expect(mocks.publishWorkspaceExternalProjectEntry).not.toHaveBeenCalled();
    expect(calls).toEqual([
      'from:workspace_external_project_entries',
      'select:["*"]',
      `eq:["id","${entryId}"]`,
      `eq:["ws_id","${workspaceId}"]`,
      'maybeSingle',
    ]);
    expect(calls.some((call) => /^(update|insert|upsert):/.test(call))).toBe(
      false
    );
    expect(calls).not.toContain(
      'from:workspace_external_project_publish_events'
    );
  });

  it('returns 404 when previewing an entry outside the workspace', async () => {
    const { calls, db } = createRecordingDb(null);
    grantAccess(db);

    const response = await post('preview');

    expect(response.status).toBe(404);
    expect(mocks.publishWorkspaceExternalProjectEntry).not.toHaveBeenCalled();
    expect(calls.some((call) => /^(update|insert|upsert):/.test(call))).toBe(
      false
    );
  });

  it('still publishes through the audited store path', async () => {
    const { db } = createRecordingDb(draftEntry);
    grantAccess(db);
    mocks.publishWorkspaceExternalProjectEntry.mockResolvedValue({
      ...draftEntry,
      status: 'published',
    });

    const response = await post('publish');

    expect(response.status).toBe(200);
    expect(mocks.publishWorkspaceExternalProjectEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        entryId,
        eventKind: 'publish',
        visibilityScope: 'public',
        workspaceId,
      }),
      db
    );
  });

  it('returns the access denial without touching the database', async () => {
    const { calls } = createRecordingDb(draftEntry);
    mocks.requireWorkspaceExternalProjectAccess.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 403 }),
    });

    const response = await post('preview');

    expect(response.status).toBe(403);
    expect(calls).toEqual([]);
  });
});
