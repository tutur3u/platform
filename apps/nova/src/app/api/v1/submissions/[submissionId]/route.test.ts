import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  jsonRequest,
  managerRole,
  participantRole,
  submissionAccessFixture,
  submissionParams,
} from '@/lib/submission-access-test-fixture';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getRole: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@/lib/app-session', () => ({
  getNovaAppSessionUserFromRequest: (...args: unknown[]) =>
    mocks.getUser(...args),
  getNovaPlatformRole: (...args: unknown[]) => mocks.getRole(...args),
}));

const path = '/api/v1/submissions/submission-1';
let fixture: ReturnType<typeof submissionAccessFixture>;

describe('Nova submission ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixture = submissionAccessFixture();
    mocks.createAdminClient.mockResolvedValue(fixture.client);
    mocks.getUser.mockReturnValue({ email: 'owner@example.com', id: 'user-1' });
    mocks.getRole.mockResolvedValue(participantRole);
  });

  it('scopes reads to the caller', async () => {
    const { GET } = await import('./route');
    const response = await GET(jsonRequest(path, 'GET'), submissionParams);

    expect(response.status).toBe(200);
    mocks.getUser.mockReturnValue({ email: 'x@example.com', id: 'user-2' });
    const other = await GET(jsonRequest(path, 'GET'), submissionParams);
    expect(other.status).toBe(404);
  });

  it.each([
    ['problem', { problemId: 'problem-2' }],
    ['session', { sessionId: 'session-2' }],
  ])('rejects moving a submission to another %s', async (_target, body) => {
    const { PUT } = await import('./route');
    const response = await PUT(
      jsonRequest(path, 'PUT', { ...body, prompt: 'moved' }),
      submissionParams
    );

    expect(response.status).toBe(400);
    expect(fixture.writes).toEqual([]);
  });

  it('rejects moving a submission even for a challenge manager', async () => {
    mocks.getRole.mockResolvedValue(managerRole);
    const { PUT } = await import('./route');
    const response = await PUT(
      jsonRequest(path, 'PUT', { problemId: 'problem-2' }),
      submissionParams
    );

    expect(response.status).toBe(400);
    expect(fixture.writes).toEqual([]);
  });

  it('forbids a participant from editing or deleting a submitted prompt', async () => {
    const { DELETE, PUT } = await import('./route');
    const put = await PUT(
      jsonRequest(path, 'PUT', { prompt: 'rewritten' }),
      submissionParams
    );
    const del = await DELETE(jsonRequest(path, 'DELETE'), submissionParams);

    expect([put.status, del.status]).toEqual([403, 403]);
    expect(fixture.writes).toEqual([]);
  });

  it('forbids a manager whose role is disabled', async () => {
    mocks.getRole.mockResolvedValue({ ...managerRole, enabled: false });
    const { PUT } = await import('./route');
    const response = await PUT(
      jsonRequest(path, 'PUT', { prompt: 'rewritten' }),
      submissionParams
    );

    expect(response.status).toBe(403);
    expect(fixture.writes).toEqual([]);
  });

  it('lets a challenge manager edit and delete their own submission', async () => {
    mocks.getRole.mockResolvedValue(managerRole);
    const { DELETE, PUT } = await import('./route');
    const put = await PUT(
      jsonRequest(path, 'PUT', { prompt: 'updated' }),
      submissionParams
    );
    const del = await DELETE(jsonRequest(path, 'DELETE'), submissionParams);

    expect([put.status, del.status]).toEqual([200, 200]);
    expect(fixture.writes).toEqual([
      expect.objectContaining({
        operation: 'update',
        payload: { prompt: 'updated' },
      }),
      expect.objectContaining({ operation: 'delete' }),
    ]);
    for (const write of fixture.writes) {
      expect(write.filters).toContainEqual(['user_id', 'user-1']);
    }
  });
});
