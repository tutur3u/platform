import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  maybeSingle: vi.fn(),
  upsert: vi.fn(),
  deleteEq: vi.fn(),
  tables: [] as string[],
}));

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, connection: vi.fn() };
});
vi.mock('@/lib/workspace-route-access', () => ({
  resolveWorkspaceRouteAccess: mocks.access,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => ({
    schema: (name: string) => ({
      from: (table: string) => {
        mocks.tables.push(`${name}.${table}`);
        return {
          select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }),
          upsert: mocks.upsert,
          delete: () => ({ eq: mocks.deleteEq }),
        };
      },
    }),
  })),
}));

import { GET, PUT } from './route';

const WS = '0f1a64f7-780f-4d30-9d72-5530f204e95c';
const USER = '5e5217de-9bb3-4e20-8d99-526ad3e7e34f';
const params = { params: Promise.resolve({ wsId: 'personal' }) };
const put = (body: unknown) =>
  PUT(
    new Request('http://localhost/api', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
    params
  );

describe('Mira audience attestation route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tables = [];
    mocks.access.mockResolvedValue({
      ok: true,
      user: { id: USER },
      permissions: { wsId: WS },
    });
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    mocks.upsert.mockResolvedValue({ error: null });
    mocks.deleteEq.mockResolvedValue({ error: null });
  });

  it('requires workspace settings management for reads and writes', async () => {
    mocks.access.mockResolvedValue({
      ok: false,
      response: NextResponse.json({}, { status: 403 }),
    });
    expect(
      (await GET(new Request('http://localhost/api'), params)).status
    ).toBe(403);
    expect((await put({ attested: true })).status).toBe(403);
    expect(mocks.access).toHaveBeenCalledWith(expect.any(Request), 'personal', [
      'manage_workspace_settings',
    ]);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('reports the stored attestation of the resolved workspace', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        ws_id: WS,
        audience: 'adults-only',
        attested_by: USER,
        attested_at: '2026-11-20T00:00:00Z',
      },
      error: null,
    });
    const response = await GET(new Request('http://localhost/api'), params);
    expect(await response.json()).toEqual({
      attested: true,
      attestedAt: '2026-11-20T00:00:00Z',
      attestedByCurrentUser: true,
    });
    expect(mocks.tables).toEqual([
      'private.workspace_mira_audience_attestations',
    ]);
  });

  it('records the authenticated actor and server time, never request values', async () => {
    const before = Date.now();
    await put({ attested: true });
    const [row, options] = mocks.upsert.mock.calls[0]!;
    expect(row).toMatchObject({
      ws_id: WS,
      audience: 'adults-only',
      attested_by: USER,
    });
    expect(Date.parse(row.attested_at)).toBeGreaterThanOrEqual(before);
    expect(options).toEqual({ onConflict: 'ws_id' });
    for (const body of [
      { attested: true, attested_by: 'other' },
      { attested: 'true' },
      { attested: true, ws_id: 'other' },
      null,
    ]) {
      mocks.upsert.mockClear();
      expect((await put(body)).status).toBe(400);
      expect(mocks.upsert).not.toHaveBeenCalled();
    }
  });

  it('withdraws by deleting the workspace row', async () => {
    await put({ attested: false });
    expect(mocks.deleteEq).toHaveBeenCalledWith('ws_id', WS);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('reports a storage failure without claiming success', async () => {
    mocks.upsert.mockResolvedValue({ error: { message: 'synthetic' } });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await put({ attested: true })).status).toBe(500);
    error.mockRestore();
  });
});
