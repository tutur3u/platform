import { NextRequest } from 'next/server';

/**
 * Builds the session-auth and education-access mocks shared by Teach v1 route
 * tests. Use from `vi.mock` factories:
 *
 *   vi.mock('@/lib/api-auth', () => sessionAuthMock(() => mocks.userClient));
 */
export function sessionAuthMock(getUserClient: () => unknown) {
  return {
    withSessionAuth:
      (handler: unknown) =>
      async (request: NextRequest, routeContext?: { params?: unknown }) =>
        (handler as (...args: unknown[]) => unknown)(
          request,
          { user: { id: 'user-1' }, supabase: getUserClient() },
          await routeContext?.params
        ),
  };
}

export function educationAccessMock(
  getAccess: () => { normalizedWsId: string; sbAdmin: unknown }
) {
  return {
    requireEducationWorkspaceAccess: async () => ({
      ok: true,
      ...getAccess(),
    }),
  };
}

export function routeRequest(
  path: string,
  init?: ConstructorParameters<typeof NextRequest>[1]
) {
  return new NextRequest(`http://localhost${path}`, init);
}
