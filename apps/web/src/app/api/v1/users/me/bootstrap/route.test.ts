import {
  BOOTSTRAP_CONFIG_IDS,
  BOOTSTRAP_SECTIONS,
  UserBootstrapResponse,
} from '@tuturuuu/internal-api/user-bootstrap';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ACTOR = '00000000-0000-4000-8000-000000000001';
const WS = '00000000-0000-4000-8000-0000000000aa';
const ok = (body: unknown, status = 200) => ({ body, status });

const h = vi.hoisted(() => ({
  auth: { ok: true },
  configs: vi.fn(),
  hidden: vi.fn(),
  invitations: vi.fn(),
  normalize: vi.fn(),
  onboarding: vi.fn(),
  profile: vi.fn(),
  summaries: vi.fn(),
  unread: vi.fn(),
  workspace: vi.fn(),
}));

vi.mock('next/server', async () => ({
  ...(await vi.importActual('next/server')),
  connection: vi.fn(),
}));
vi.mock('@/lib/api-auth', async () => {
  const { NextResponse } =
    await vi.importActual<typeof import('next/server')>('next/server');
  return {
    withSessionAuth:
      (handler: (request: Request, context: unknown) => Promise<Response>) =>
      async (request: Request) =>
        h.auth.ok
          ? handler(request, {
              supabase: {},
              user: { email: 'a@example.test', id: ACTOR },
            })
          : NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
  };
});
vi.mock('@tuturuuu/utils/workspace-helper', () => {
  class WorkspaceNotFoundError extends Error {}
  return {
    isWorkspaceUuidLiteral: (value: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value
      ),
    normalizeWorkspaceId: h.normalize,
    WorkspaceNotFoundError,
  };
});
vi.mock('@/lib/current-user/profile', () => ({
  readCurrentUserProfile: h.profile,
}));
vi.mock('@/lib/current-user/configs', () => ({ readUserConfigs: h.configs }));
vi.mock('@/lib/current-user/onboarding', () => ({
  readOnboardingProgress: h.onboarding,
}));
vi.mock('@/lib/current-user/hidden-workspaces', () => ({
  readHiddenWorkspaceIds: h.hidden,
}));
vi.mock('@/lib/current-user/invitations', () => ({
  readPendingInvitations: h.invitations,
}));
vi.mock('@/lib/current-user/workspace', () => ({
  readWorkspaceForUser: h.workspace,
}));
vi.mock('@/lib/current-user/workspace-list', () => ({
  readWorkspaceSummaries: h.summaries,
}));
vi.mock('@/lib/notifications/unread-count', () => ({
  countUnreadNotifications: h.unread,
}));

import { BOOTSTRAP_SECTION_DEADLINE_MS } from './sections';
import { GET } from './route';

const ALL =
  'sections=profile,workspace,configs,onboarding,unreadCount,invitations,hiddenWorkspaces,workspaces';
const FULL = `${ALL}&configs=${BOOTSTRAP_CONFIG_IDS.join(',')}&wsId=${WS}&unreadWsId=${WS}`;

const get = (query: string, actor = ACTOR) =>
  GET(
    new NextRequest(
      `https://example.test/api/v1/users/me/bootstrap?expectedActorId=${actor}&${query}`
    ),
    undefined as never
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  h.auth.ok = true;
  h.normalize.mockImplementation(async (id: string) => id);
  h.profile.mockResolvedValue(ok({ id: ACTOR }));
  h.workspace.mockResolvedValue(ok({ id: WS }));
  h.configs.mockImplementation(async (_ctx: unknown, ids: string[]) =>
    Object.fromEntries(ids.map((id) => [id, ok({ value: null })]))
  );
  h.onboarding.mockResolvedValue(ok(null));
  h.unread.mockResolvedValue(ok({ count: 3 }));
  h.invitations.mockResolvedValue(ok({ invitations: [] }));
  h.hidden.mockResolvedValue(ok({ hiddenWorkspaceIds: [WS] }));
  h.summaries.mockResolvedValue(ok([{ id: WS }]));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('bootstrap contract', () => {
  it('returns every requested section and parses with the contract schema', async () => {
    const response = await get(FULL);
    expect(response.status).toBe(200);
    const body = await response.json();
    const parsed = UserBootstrapResponse.parse(body);
    expect(parsed.version).toBe(1);
    expect(parsed.actorId).toBe(ACTOR);
    expect(Object.keys(body.sections).sort()).toEqual(
      [...BOOTSTRAP_SECTIONS].sort()
    );
    expect(Object.keys(body.sections.configs).sort()).toEqual(
      [...BOOTSTRAP_CONFIG_IDS].sort()
    );
    expect(body.sections.unreadCount).toEqual({ data: { count: 3 }, ok: true });
  });

  it('returns only the requested sections', async () => {
    const body = await (await get('sections=profile,onboarding')).json();
    expect(Object.keys(body.sections).sort()).toEqual([
      'onboarding',
      'profile',
    ]);
    expect(h.workspace).not.toHaveBeenCalled();
    expect(h.hidden).not.toHaveBeenCalled();
  });

  it('de-duplicates repeated sections and config ids', async () => {
    await get('sections=configs,configs&configs=SORBET_THEME,SORBET_THEME');
    expect(h.configs).toHaveBeenCalledTimes(1);
    expect(h.configs.mock.calls[0]?.[1]).toEqual(['SORBET_THEME']);
  });

  it('sets private, no-store and a closed Server-Timing vocabulary', async () => {
    const response = await get(FULL);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('Timing-Allow-Origin')).toBeNull();
    const labels = (response.headers.get('Server-Timing') ?? '')
      .split(', ')
      .map((entry) => entry.split(';')[0]);
    const allowed = new Set([
      'auth',
      'total',
      ...BOOTSTRAP_SECTIONS.map((section) => `s-${section}`),
    ]);
    expect(labels.length).toBeGreaterThan(1);
    for (const label of labels) expect(allowed.has(label as string)).toBe(true);
    expect(labels).not.toContain('db');
    expect(response.headers.get('Server-Timing')).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}|@/
    );
  });

  it('passes a pass-through db wrapper so concurrent reads are not summed', async () => {
    await get('sections=profile');
    const ctx = h.profile.mock.calls[0]?.[0];
    await expect(ctx.db(() => 7)).resolves.toBe(7);
  });
});

describe('bootstrap parameters', () => {
  const bad = (query: string) => async () => {
    const response = await get(query);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_request' });
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    for (const reader of Object.values(h)) {
      if (typeof reader === 'function' && 'mock' in reader) {
        expect(reader).not.toHaveBeenCalled();
      }
    }
  };

  it('rejects a missing sections list', bad('configs=SORBET_THEME'));
  it('rejects an empty sections list', bad('sections='));
  it('rejects an unknown section', bad('sections=profile,admin'));
  it(
    'rejects more than 8 sections',
    bad(`sections=${'profile,'.repeat(9)}profile`)
  );
  it(
    'rejects a config outside the allowlist',
    bad('sections=configs&configs=TASK_DEFAULT_BOARD_ID')
  );
  it(
    'rejects configs without the configs section',
    bad('sections=profile&configs=SORBET_THEME')
  );
  it('rejects the configs section without ids', bad('sections=configs'));
  it('rejects workspace without wsId', bad('sections=workspace'));
  it(
    'rejects wsId without the workspace section',
    bad(`sections=profile&wsId=${WS}`)
  );
  it(
    'rejects a wsId over 64 characters',
    bad(`sections=workspace&wsId=${'a'.repeat(65)}`)
  );
  it(
    'rejects unreadWsId without unreadCount',
    bad(`sections=profile&unreadWsId=${WS}`)
  );
  it(
    'rejects a malformed unreadWsId',
    bad('sections=unreadCount&unreadWsId=nope')
  );
  it('rejects repeated and unknown parameters', async () => {
    await bad('sections=profile&sections=onboarding')();
    await bad('sections=profile&extra=1')();
  });

  it('rejects a missing or malformed expectedActorId', async () => {
    const missing = await GET(
      new NextRequest(
        'https://example.test/api/v1/users/me/bootstrap?sections=profile'
      ),
      undefined as never
    );
    expect(missing.status).toBe(400);
    expect((await get('sections=profile', 'not-a-uuid')).status).toBe(400);
  });
});

describe('bootstrap actor guard and kill switch', () => {
  it('returns 409 for the whole response before any section starts', async () => {
    const response = await get(FULL, '00000000-0000-4000-8000-0000000000ff');
    expect(response.status).toBe(409);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ message: 'Account changed' });
    expect(h.profile).not.toHaveBeenCalled();
    expect(h.hidden).not.toHaveBeenCalled();
    expect(h.summaries).not.toHaveBeenCalled();
  });

  it('returns 401 with no sections when auth fails', async () => {
    h.auth.ok = false;
    const response = await get(FULL);
    expect(response.status).toBe(401);
    expect(await response.json()).not.toHaveProperty('sections');
    expect(h.profile).not.toHaveBeenCalled();
  });

  it('answers 404 before any auth work when the kill switch is on', async () => {
    vi.stubEnv('USER_BOOTSTRAP_DISABLED', '1');
    h.auth.ok = false;
    const response = await get(FULL);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(h.profile).not.toHaveBeenCalled();
  });
});

describe('bootstrap partial failure', () => {
  it('keeps the other sections when one reader throws', async () => {
    h.hidden.mockRejectedValue(new Error('secret@example.test exploded'));
    const response = await get(FULL);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.sections.hiddenWorkspaces).toEqual({
      error: { code: 'failed', status: 500 },
      ok: false,
    });
    expect(body.sections.profile.ok).toBe(true);
    expect(body.sections.unreadCount.ok).toBe(true);
    expect(JSON.stringify(body)).not.toContain('secret@example.test');
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).not.toContain('secret@example.test');
  });

  it('maps reader statuses to codes without carrying bodies', async () => {
    h.unread.mockResolvedValue(
      ok({ error: 'Access denied to workspace' }, 403)
    );
    h.onboarding.mockResolvedValue(ok({ message: 'nope' }, 404));
    h.invitations.mockResolvedValue(ok({ error: 'x', errorCode: 'Y' }, 500));
    const body = await (await get(FULL)).json();
    expect(body.sections.unreadCount).toEqual({
      error: { code: 'forbidden', status: 403 },
      ok: false,
    });
    expect(body.sections.onboarding).toEqual({
      error: { code: 'not_found', status: 404 },
      ok: false,
    });
    expect(body.sections.invitations).toEqual({
      error: { code: 'failed', status: 500 },
      ok: false,
    });
  });

  it('times out a slow section while the others return', async () => {
    vi.useFakeTimers();
    h.summaries.mockReturnValue(new Promise(() => {}));
    const pending = get(FULL);
    await vi.advanceTimersByTimeAsync(BOOTSTRAP_SECTION_DEADLINE_MS + 1);
    const response = await pending;
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.sections.workspaces).toEqual({
      error: { code: 'timeout', status: 504 },
      ok: false,
    });
    expect(body.sections.profile.ok).toBe(true);
  });

  it('still answers 200 when every section fails', async () => {
    for (const reader of [
      h.profile,
      h.workspace,
      h.configs,
      h.onboarding,
      h.unread,
      h.invitations,
      h.hidden,
      h.summaries,
    ]) {
      reader.mockRejectedValue(new Error('down'));
    }
    const response = await get(FULL);
    expect(response.status).toBe(200);
    const body = UserBootstrapResponse.parse(await response.json());
    expect(body.sections.profile?.ok).toBe(false);
    expect(body.sections.configs?.SORBET_THEME?.ok).toBe(false);
  });

  it('fails only the gated config when one id is forbidden', async () => {
    h.configs.mockResolvedValue({
      SHOW_VERSION_BADGE: ok({ message: 'Forbidden' }, 403),
      SORBET_THEME: ok({ value: 'dark' }),
    });
    const body = await (
      await get('sections=configs&configs=SORBET_THEME,SHOW_VERSION_BADGE')
    ).json();
    expect(body.sections.configs.SORBET_THEME).toEqual({
      data: { value: 'dark' },
      ok: true,
    });
    expect(body.sections.configs.SHOW_VERSION_BADGE).toEqual({
      error: { code: 'forbidden', status: 403 },
      ok: false,
    });
  });
});
