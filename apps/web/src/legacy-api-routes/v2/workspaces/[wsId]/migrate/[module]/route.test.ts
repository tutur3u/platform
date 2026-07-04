import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDynamicAdminClient: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createDynamicAdminClient: (
    ...args: Parameters<typeof mocks.createDynamicAdminClient>
  ) => mocks.createDynamicAdminClient(...args),
}));

vi.mock('@/lib/api-middleware', () => ({
  createErrorResponse: (
    error: string,
    message: string,
    status: number,
    code?: string
  ) =>
    Response.json(
      {
        error,
        message,
        ...(code ? { code } : {}),
      },
      { status }
    ),
  withApiAuth:
    (handler: unknown) =>
    async (
      request: NextRequest,
      routeContext?: { params?: Promise<unknown> }
    ) =>
      (
        handler as (
          request: NextRequest,
          context: {
            params: { wsId: string; module: string };
            context: { wsId: string };
          }
        ) => Promise<Response>
      )(request, {
        context: { wsId: 'ws-1' },
        params: (await routeContext?.params) as {
          wsId: string;
          module: string;
        },
      }),
}));

describe('workspace migration module route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it.each([
    ['email-blacklist', 'the global email blacklist'],
    ['post-email-queue', 'post email queue delivery metadata'],
  ])('does not expose %s through workspace API keys', async (module) => {
    const { GET } = await import(
      '@/legacy-api-routes/v2/workspaces/[wsId]/migrate/[module]/route'
    );

    const response = await GET(
      new NextRequest(
        `http://localhost/api/v2/workspaces/ws-1/migrate/${module}`
      ),
      {
        params: Promise.resolve({
          module,
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: 'UNKNOWN_MODULE',
      error: 'Bad Request',
      message: `Unknown migration module: ${module}`,
    });
    expect(mocks.createDynamicAdminClient).not.toHaveBeenCalled();
  });
});
