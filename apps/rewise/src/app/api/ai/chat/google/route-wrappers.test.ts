import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createNewPost: vi.fn((_options: unknown) => vi.fn()),
  createStreamPost: vi.fn(() => vi.fn()),
  createSummaryPatch: vi.fn(() => vi.fn()),
  resolveRewiseAiRouteAuth: vi.fn(),
  resolveRewiseGatewayAuth: vi.fn(),
}));

vi.mock('@tuturuuu/ai/chat/google/new/route', () => ({
  createPOST: mocks.createNewPost,
}));
vi.mock('@tuturuuu/ai/chat/google/route', () => ({
  createPOST: mocks.createStreamPost,
}));
vi.mock('@tuturuuu/ai/chat/google/summary/route', () => ({
  createPATCH: mocks.createSummaryPatch,
}));
vi.mock('./route-auth', () => ({
  resolveRewiseAiRouteAuth: mocks.resolveRewiseAiRouteAuth,
  resolveRewiseGatewayAuth: mocks.resolveRewiseGatewayAuth,
}));

describe('Rewise AI route wrapper workspace requirements', () => {
  it('requires selected workspace authorization on stream, new, and summary routes', async () => {
    await import('./route');
    await import('./new/route');
    await import('./summary/route');

    expect(mocks.createStreamPost).toHaveBeenCalledWith({
      requireWorkspaceId: true,
      resolveAuth: mocks.resolveRewiseAiRouteAuth,
      serverAPIKeyFallback: true,
    });
    expect(mocks.createNewPost).toHaveBeenCalledWith({
      requireWorkspaceId: true,
      resolveGatewayAuth: expect.any(Function),
    });

    const newRouteOptions = mocks.createNewPost.mock.calls[0]?.[0] as
      | {
          resolveGatewayAuth: (request: Request) => Promise<unknown>;
        }
      | undefined;
    const request = new Request('http://localhost/api/ai/chat/google/new');
    await newRouteOptions?.resolveGatewayAuth(request);
    expect(mocks.resolveRewiseGatewayAuth).toHaveBeenCalledWith(request, {
      targetApp: 'rewise',
    });
    expect(mocks.createSummaryPatch).toHaveBeenCalledWith({
      requireWorkspaceId: true,
      resolveAuth: mocks.resolveRewiseAiRouteAuth,
    });
  });
});
