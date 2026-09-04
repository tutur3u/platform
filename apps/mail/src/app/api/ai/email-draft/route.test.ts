import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  generateObject: vi.fn(),
  google: vi.fn(),
  resolveMailRouteContext: vi.fn(),
  validateAiTempAuthRequest: vi.fn(),
  withAiMemory: vi.fn(),
}));

vi.mock('@ai-sdk/google', () => ({ google: mocks.google }));
vi.mock('@tuturuuu/ai/memory', () => ({ withAiMemory: mocks.withAiMemory }));
vi.mock('@tuturuuu/utils/ai-temp-auth', () => ({
  validateAiTempAuthRequest: mocks.validateAiTempAuthRequest,
}));
vi.mock('ai', () => ({ generateObject: mocks.generateObject }));
vi.mock('@/lib/mail/auth', () => ({
  resolveMailRouteContext: mocks.resolveMailRouteContext,
}));

import { POST } from './route';

function request() {
  return new NextRequest('https://mail.example.com/api/ai/email-draft', {
    body: JSON.stringify({
      context: 'Quarterly update',
      recipients: 'team@example.com',
      userEmail: 'member@tuturuuu.com',
      userDisplayName: 'Member',
      wsId: 'personal',
    }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
}

describe('email draft route auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.validateAiTempAuthRequest.mockResolvedValue({ status: 'missing' });
    mocks.google.mockReturnValue('model');
    mocks.withAiMemory.mockResolvedValue('memory-model');
    mocks.generateObject.mockResolvedValue({
      object: { content: 'Hello team', subject: 'Quarterly update' },
    });
  });

  it('uses the app-session-aware Mail workspace context', async () => {
    mocks.resolveMailRouteContext.mockResolvedValue({
      ok: true,
      context: {
        normalizedWsId: 'workspace-1',
        supabase: {},
        user: { email: 'member@tuturuuu.com', id: 'user-1' },
      },
    });

    const response = await POST(request());

    expect(mocks.resolveMailRouteContext).toHaveBeenCalledWith(
      expect.any(NextRequest),
      'personal'
    );
    expect(mocks.withAiMemory).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', wsId: 'personal' })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      content: 'Hello team',
      subject: 'Quarterly update',
    });
  });

  it('forwards a rejected Mail workspace context', async () => {
    mocks.resolveMailRouteContext.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.generateObject).not.toHaveBeenCalled();
  });
});
