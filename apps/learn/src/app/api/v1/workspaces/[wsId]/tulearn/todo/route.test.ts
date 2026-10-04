import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const state = vi.hoisted(() => ({ list: vi.fn(), normalize: vi.fn() }));
vi.mock('@tuturuuu/education-core/todo/service', () => ({
  listEducationTodo: state.list,
}));
vi.mock('@tuturuuu/education-core/tulearn/access', () => ({
  tulearnAccessErrorResponse: () => null,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => 'admin',
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: state.normalize,
}));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: async () => undefined,
}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (
      handler: (
        request: NextRequest,
        context: unknown,
        params: unknown
      ) => unknown
    ) =>
    (request: NextRequest) =>
      handler(
        request,
        { supabase: 'verified-client', user: { id: 'signed-in-actor' } },
        { wsId: 'alias' }
      ),
}));
describe('learn personal to do route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.normalize.mockResolvedValue('verified-workspace');
    state.list.mockResolvedValue({ data: [], count: 0 });
  });
  it('passes verified actor/workspace and private no-store response', async () => {
    const response = await GET(
      new NextRequest(
        'https://example.test/api/todo?kind=lessons&page=2'
      ) as never,
      { params: Promise.resolve({ wsId: 'alias' }) }
    );
    expect(state.list).toHaveBeenCalledWith({
      db: 'admin',
      userId: 'signed-in-actor',
      wsId: 'verified-workspace',
      app: 'learn',
      kind: 'lessons',
      page: 2,
      pageSize: 20,
    });
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
  it.each(['studentId=another-student', 'page=0', 'pageSize=101', 'kind=all'])(
    'rejects unsafe or invalid query %s before reading data',
    async (query) => {
      const response = await GET(
        new NextRequest(`https://example.test/api/todo?${query}`) as never,
        { params: Promise.resolve({ wsId: 'alias' }) }
      );
      expect(response.status).toBe(400);
      expect(state.list).not.toHaveBeenCalled();
    }
  );
});
