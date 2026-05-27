import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const requireTeachWorkspaceAccess = vi.fn();

  const quizzesBuilder: Record<string, any> = Promise.resolve({
    data: [
      {
        created_at: '2026-05-19T00:00:00.000Z',
        id: 'quiz-1',
        question: 'Question?',
        quiz_options: [
          {
            explanation: null,
            id: 'option-1',
            is_correct: true,
            value: 'Answer',
          },
        ],
      },
    ],
    count: 1,
    error: null,
  });
  quizzesBuilder.eq = vi.fn(() => quizzesBuilder);
  quizzesBuilder.ilike = vi.fn(() => quizzesBuilder);
  quizzesBuilder.order = vi.fn(() => quizzesBuilder);
  quizzesBuilder.range = vi.fn(() => quizzesBuilder);

  const sessionSupabase = {
    from: vi.fn((table: string) => {
      if (table === 'workspace_quizzes') {
        return {
          select: vi.fn(() => quizzesBuilder),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return {
    requireTeachWorkspaceAccess,
    quizzesBuilder,
    sessionSupabase,
  };
});

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: unknown) =>
    async (
      request: NextRequest,
      routeContext?: { params?: Promise<unknown> }
    ) =>
      (
        handler as (
          request: NextRequest,
          context: {
            user: { id: string };
            supabase: typeof mocks.sessionSupabase;
          },
          params: { wsId: string }
        ) => Promise<Response>
      )(
        request,
        { user: { id: 'user-1' }, supabase: mocks.sessionSupabase },
        (await routeContext?.params) as { wsId: string }
      ),
}));

vi.mock('@/lib/teach/api', () => ({
  requireTeachWorkspaceAccess: (
    ...args: Parameters<typeof mocks.requireTeachWorkspaceAccess>
  ) => mocks.requireTeachWorkspaceAccess(...args),
}));

describe('workspace quizzes route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.requireTeachWorkspaceAccess.mockResolvedValue({
      normalizedWsId: '00000000-0000-0000-0000-000000000001',
      ok: true,
      sbAdmin: mocks.sessionSupabase,
    });
  });

  it('returns 403 before disclosing answer keys when education access is denied', async () => {
    mocks.requireTeachWorkspaceAccess.mockResolvedValue(
      NextResponse.json(
        { message: 'Insufficient permissions' },
        { status: 403 }
      )
    );

    const { GET } = await import(
      '@/app/api/v1/workspaces/[wsId]/quizzes/route'
    );

    const response = await GET(
      new NextRequest('http://localhost/api/v1/workspaces/ws-1/quizzes'),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: 'Insufficient permissions',
    });
    expect(mocks.sessionSupabase.from).not.toHaveBeenCalled();
  });

  it('returns quiz options for authorized education users', async () => {
    const { GET } = await import(
      '@/app/api/v1/workspaces/[wsId]/quizzes/route'
    );

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/quizzes?page=1&pageSize=20'
      ),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.count).toBe(1);
    expect(payload.data[0].quiz_options[0].is_correct).toBe(true);
    expect(mocks.quizzesBuilder.eq).toHaveBeenCalledWith(
      'ws_id',
      '00000000-0000-0000-0000-000000000001'
    );
  });
});
