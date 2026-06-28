import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';

const mocks = vi.hoisted(() => ({
  authorizeAbuseIntelligenceRequest: vi.fn(),
  createAuthRecoveryOverride: vi.fn(),
  listAuthRecoverySnapshot: vi.fn(),
  serverLoggerError: vi.fn(),
}));

vi.mock('@/lib/auth/recovery', () => ({
  createAuthRecoveryOverride: (
    ...args: Parameters<typeof mocks.createAuthRecoveryOverride>
  ) => mocks.createAuthRecoveryOverride(...args),
  listAuthRecoverySnapshot: (
    ...args: Parameters<typeof mocks.listAuthRecoverySnapshot>
  ) => mocks.listAuthRecoverySnapshot(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: Parameters<typeof mocks.serverLoggerError>) =>
      mocks.serverLoggerError(...args),
  },
}));

vi.mock('../abuse-intelligence/_shared', () => ({
  authorizeAbuseIntelligenceRequest: (
    ...args: Parameters<typeof mocks.authorizeAbuseIntelligenceRequest>
  ) => mocks.authorizeAbuseIntelligenceRequest(...args),
}));

function createRequest(body?: unknown, url = 'http://localhost/api') {
  return new NextRequest(url, {
    body: body === undefined ? undefined : JSON.stringify(body),
    method: body === undefined ? 'GET' : 'POST',
  });
}

describe('infrastructure auth recovery routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeAbuseIntelligenceRequest.mockResolvedValue({
      ok: true,
      user: { id: 'admin-user-1' },
    });
    mocks.listAuthRecoverySnapshot.mockResolvedValue({
      diagnostics: null,
      events: [],
      overrides: [],
    });
    mocks.createAuthRecoveryOverride.mockResolvedValue({
      email: 'person@example.com',
      id: 'override-1',
    });
  });

  it('loads auth recovery diagnostics for infrastructure viewers', async () => {
    const request = createRequest(
      undefined,
      'http://localhost/api/v1/infrastructure/auth-recovery?email=person@example.com'
    );

    const response = await GET(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      diagnostics: null,
      events: [],
      overrides: [],
    });
    expect(mocks.authorizeAbuseIntelligenceRequest).toHaveBeenCalledWith(
      request
    );
    expect(mocks.listAuthRecoverySnapshot).toHaveBeenCalledWith(
      'person@example.com'
    );
  });

  it('creates auth recovery overrides for platform role managers', async () => {
    const request = createRequest(
      {
        allowNormalLogin: true,
        allowRecoveryEmail: true,
        clearEmailScoped: true,
        clearRelatedIpBlocks: false,
        clearRelatedIpCounters: true,
        email: 'person@example.com',
        reason: 'Manual identity review complete',
      },
      'http://localhost/api/v1/infrastructure/auth-recovery'
    );

    const response = await POST(request);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      override: {
        email: 'person@example.com',
        id: 'override-1',
      },
    });
    expect(mocks.authorizeAbuseIntelligenceRequest).toHaveBeenCalledWith(
      request,
      'manage_workspace_roles'
    );
    expect(mocks.createAuthRecoveryOverride).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'admin-user-1',
        allowNormalLogin: true,
        allowRecoveryEmail: true,
        clearEmailScoped: true,
        clearRelatedIpBlocks: false,
        clearRelatedIpCounters: true,
        email: 'person@example.com',
        reason: 'Manual identity review complete',
        request,
      })
    );
  });

  it('returns authorization failures without calling recovery services', async () => {
    mocks.authorizeAbuseIntelligenceRequest.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
    });

    const response = await POST(
      createRequest({
        email: 'person@example.com',
        reason: 'Manual review',
      })
    );

    expect(response.status).toBe(403);
    expect(mocks.createAuthRecoveryOverride).not.toHaveBeenCalled();
  });
});
