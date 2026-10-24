// @vitest-environment node
import { CalendarSettingsError } from '@tuturuuu/internal-api/calendar-settings-server';
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  suspension: vi.fn(),
  quota: vi.fn(),
  finalize: vi.fn(),
  assurance: vi.fn(),
  personal: vi.fn(),
  workspace: vi.fn(),
  connection: vi.fn(),
}));
vi.mock('@tuturuuu/utils/abuse-protection/user-suspension', () => ({
  checkUserSuspension: mocks.suspension,
}));
vi.mock('./calendar-personal-mutation-quota', () => ({
  calendarPersonalSessionControls: mocks.quota,
}));
vi.mock('@/lib/api-auth', () => ({ resolveSessionAuthContext: mocks.auth }));
vi.mock('@tuturuuu/utils/required-mfa-runtime', () => ({
  enforceRequiredMfaRequest: mocks.assurance,
}));
vi.mock(
  '@tuturuuu/internal-api/calendar-settings-server',
  async (original) => ({
    ...(await original<object>()),
    personalCalendarSettings: mocks.personal,
    workspaceCalendarSettings: mocks.workspace,
  })
);
vi.mock('next/server', async (original) => ({
  ...(await original<object>()),
  connection: mocks.connection,
}));

import {
  GET as personalGET,
  PATCH as personalPATCH,
} from '@/app/api/v1/users/calendar-settings/route';
import {
  GET as workspaceGET,
  PATCH as workspacePATCH,
} from '@/app/api/v1/workspaces/[wsId]/calendar-settings/route';

const context = { params: Promise.resolve({ wsId: 'workspace' }) };
function request(method = 'GET', body?: string) {
  return new NextRequest(
    'https://tuturuuu.com/api/v1/users/calendar-settings',
    { method, headers: { authorization: 'Bearer token' }, body }
  );
}
describe('Web calendar settings adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assurance.mockResolvedValue(null);
    mocks.finalize.mockImplementation((response) => response);
    mocks.quota.mockResolvedValue({
      response: null,
      headers: { 'X-RateLimit-Limit': '60' },
      finalize: mocks.finalize,
    });
    mocks.suspension.mockResolvedValue({ suspended: false });
    mocks.auth.mockResolvedValue({
      ok: true,
      user: { id: 'actor' },
      supabase: {},
    });
    mocks.personal.mockResolvedValue({ timezone: 'auto' });
    mocks.workspace.mockResolvedValue({ timezone: 'auto' });
  });
  it('opts both GET routes into request time and returns private JSON', async () => {
    const response = await personalGET(request());
    await workspaceGET(request(), context);
    expect(mocks.connection).toHaveBeenCalledTimes(2);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ timezone: 'auto' });
    expect(mocks.finalize).toHaveBeenCalledWith(response);
    expect(mocks.auth).toHaveBeenCalledWith(expect.anything(), {
      allowAppSessionAuth: false,
    });
    expect(mocks.personal).toHaveBeenCalledWith(
      { supabase: {}, userId: 'actor' },
      { method: 'GET' }
    );
  });
  it('returns auth failures without reading settings', async () => {
    mocks.auth.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });
    expect((await personalGET(request())).status).toBe(401);
    expect(mocks.personal).not.toHaveBeenCalled();
  });
  it('returns MFA guard status and diagnostic headers before resolving identity', async () => {
    mocks.assurance.mockResolvedValue(
      NextResponse.json(
        { code: 'MFA_REQUIRED' },
        { status: 403, headers: { 'X-Tuturuuu-Auth-Assurance': 'required' } }
      )
    );
    const response = await workspaceGET(request(), context);
    expect(response.status).toBe(403);
    expect(response.headers.get('X-Tuturuuu-Auth-Assurance')).toBe('required');
    expect(mocks.auth).not.toHaveBeenCalled();
  });
  it('passes PATCH JSON and normalizes the personal workspace alias', async () => {
    await personalPATCH(request('PATCH', '{"timezone":"auto"}'));
    await workspacePATCH(request('PATCH', '{"first_day_of_week":"monday"}'), {
      params: Promise.resolve({ wsId: 'personal' }),
    });
    expect(mocks.workspace).toHaveBeenCalledWith(
      { supabase: {}, userId: 'actor' },
      'actor',
      { method: 'PATCH', body: { first_day_of_week: 'monday' } }
    );
  });
  it('rejects suspended actors on personal preferences before reading or writing settings', async () => {
    mocks.suspension.mockResolvedValue({
      suspended: true,
      reason: 'Account suspended',
    });
    expect((await personalGET(request())).status).toBe(403);
    expect(
      (await personalPATCH(request('PATCH', '{"timezone":"auto"}'))).status
    ).toBe(403);
    expect(mocks.personal).not.toHaveBeenCalled();
    expect(mocks.suspension).toHaveBeenCalledWith('actor');
  });
  it('preserves the personal suspension lookup fail-open policy', async () => {
    mocks.suspension.mockRejectedValue(new Error('unavailable'));
    expect((await personalGET(request())).status).toBe(200);
    expect(mocks.personal).toHaveBeenCalledTimes(1);
  });
  it('keeps workspace preferences independent of the personal suspension policy', async () => {
    expect((await workspaceGET(request(), context)).status).toBe(200);
    expect(mocks.suspension).not.toHaveBeenCalled();
  });
  it('returns shared domain validation and permission failure status', async () => {
    mocks.personal.mockRejectedValue(
      new CalendarSettingsError(400, 'Invalid request data')
    );
    const invalid = await personalPATCH(
      request('PATCH', '{"timezone":"invalid"}')
    );
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: 'Invalid request data' });
    expect(mocks.finalize).toHaveBeenCalledWith(invalid);
    mocks.workspace.mockRejectedValue(
      new CalendarSettingsError(403, 'Workspace access denied')
    );
    const denied = await workspaceGET(request(), context);
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ error: 'Workspace access denied' });
  });
  it('keeps personal mutation quota rejection and diagnostic headers before writing', async () => {
    const blocked = NextResponse.json(
      {},
      {
        status: 429,
        headers: {
          'X-RateLimit-Policy': 'native-calendar-preferences',
          'Retry-After': '60',
        },
      }
    );
    mocks.quota.mockResolvedValue({
      response: blocked,
      headers: {},
      finalize: mocks.finalize,
    });
    const response = await personalPATCH(
      request('PATCH', '{"timezone":"auto"}')
    );
    expect(response).toBe(blocked);
    expect(response.headers.get('X-RateLimit-Policy')).toBe(
      'native-calendar-preferences'
    );
    expect(mocks.personal).not.toHaveBeenCalled();
  });
  it('rejects malformed JSON', async () => {
    expect((await personalPATCH(request('PATCH', '{'))).status).toBe(400);
    expect(mocks.personal).not.toHaveBeenCalled();
  });
});
