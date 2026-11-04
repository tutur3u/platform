import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const WS_ID = '00000000-0000-4000-8000-000000000002';
const FORM_ID = '50000000-0000-0000-0000-000000000001';

const { getWorkspaceRouteContextMock, fromMock } = vi.hoisted(() => ({
  getWorkspaceRouteContextMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock('next/server', async () => {
  const actual =
    await vi.importActual<typeof import('next/server')>('next/server');

  return { ...actual, connection: vi.fn() };
});

vi.mock('@/features/forms/route-utils', () => ({
  getWorkspaceRouteContext: getWorkspaceRouteContextMock,
  parseFormIdParam: (value: string) => value,
}));

vi.mock('@/features/forms/server', () => ({
  generateFormShareCode: vi.fn(() => 'new-code'),
  getPrivateFormsClient: vi.fn(() => ({ from: fromMock })),
}));

import { GET } from './route';

type Result = { data: unknown; error: { message: string } | null };

const calls: { table: string; op: string; filters: [string, unknown][] }[] = [];

function mockTables(results: {
  forms: Result;
  existingLink?: Result;
  insertedLink?: Result;
}) {
  fromMock.mockImplementation((table: string) => {
    const call = { table, op: 'select', filters: [] as [string, unknown][] };
    calls.push(call);
    const builder: Record<string, unknown> = {
      select: vi.fn(() => builder),
      insert: vi.fn(() => {
        call.op = 'insert';
        return builder;
      }),
      eq: vi.fn((column: string, value: unknown) => {
        call.filters.push([column, value]);
        return builder;
      }),
      maybeSingle: vi.fn(async () =>
        table === 'forms'
          ? results.forms
          : (results.existingLink ?? { data: null, error: null })
      ),
      single: vi.fn(
        async () => results.insertedLink ?? { data: null, error: null }
      ),
    };
    return builder;
  });
}

function request() {
  return GET(
    new NextRequest(
      `http://localhost/api/v1/workspaces/${WS_ID}/forms/${FORM_ID}/share-link`
    ),
    { params: Promise.resolve({ wsId: WS_ID, formId: FORM_ID }) }
  );
}

describe('form share-link route GET', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;
    getWorkspaceRouteContextMock.mockResolvedValue({
      adminClient: {},
      canManageForms: true,
      isMember: true,
      user: { id: '00000000-0000-4000-8000-000000000001' },
      wsId: WS_ID,
    });
  });

  it('returns 404 without touching share links for a foreign form', async () => {
    mockTables({ forms: { data: null, error: null } });

    const response = await request();

    expect(response.status).toBe(404);
    expect(calls.map((call) => call.table)).toEqual(['forms']);
    expect(calls[0]?.filters).toEqual([
      ['id', FORM_ID],
      ['ws_id', WS_ID],
    ]);
  });

  it('returns 500 without touching share links when the form lookup fails', async () => {
    mockTables({ forms: { data: null, error: { message: 'db down' } } });

    const response = await request();

    expect(response.status).toBe(500);
    expect(calls.map((call) => call.table)).toEqual(['forms']);
  });

  it('returns the existing share link for a same-workspace form', async () => {
    mockTables({
      forms: { data: { id: FORM_ID }, error: null },
      existingLink: { data: { code: 'abc', active: true }, error: null },
    });

    const response = await request();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      shareLink: { code: 'abc', active: true },
    });
    expect(calls.some((call) => call.op === 'insert')).toBe(false);
  });

  it('creates a share link for a same-workspace form without one', async () => {
    mockTables({
      forms: { data: { id: FORM_ID }, error: null },
      insertedLink: { data: { code: 'new-code', active: true }, error: null },
    });

    const response = await request();

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      shareLink: { code: 'new-code', active: true },
    });
    expect(calls.some((call) => call.op === 'insert')).toBe(true);
  });
});
