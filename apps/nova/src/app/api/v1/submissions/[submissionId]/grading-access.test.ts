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

let fixture: ReturnType<typeof submissionAccessFixture>;

const owner = { email: 'owner@example.com', id: 'user-1' };
const otherUser = { email: 'other@example.com', id: 'user-2' };
const manager = { email: 'manager@example.com', id: 'manager-1' };

const routes = [
  {
    name: 'criteria',
    load: () => import('./criteria/route'),
    path: '/api/v1/submissions/submission-1/criteria',
    body: { criteriaId: 'criterion-1', feedback: 'Great', score: 10 },
    crossBody: { criteriaId: 'criterion-other', feedback: 'Great', score: 10 },
    table: 'nova_submission_criteria',
  },
  {
    name: 'test-cases',
    load: () => import('./test-cases/route'),
    path: '/api/v1/submissions/submission-1/test-cases',
    body: { matched: true, output: 'ok', testCaseId: 'test-case-1' },
    crossBody: { matched: true, output: 'ok', testCaseId: 'test-case-other' },
    table: 'nova_submission_test_cases',
  },
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  fixture = submissionAccessFixture();
  mocks.createAdminClient.mockResolvedValue(fixture.client);
  mocks.getUser.mockReturnValue(owner);
  mocks.getRole.mockResolvedValue(participantRole);
});

describe.each(routes)('Nova submission $name grading', (route) => {
  it('forbids a participant from grading their own submission', async () => {
    const { PUT } = await route.load();
    const response = await PUT(
      jsonRequest(route.path, 'PUT', route.body),
      submissionParams
    );

    expect(response.status).toBe(403);
    expect(fixture.writes).toEqual([]);
  });

  it("forbids any signed-in user from deleting another user's grading", async () => {
    mocks.getUser.mockReturnValue(otherUser);
    const { DELETE } = await route.load();
    const response = await DELETE(
      jsonRequest(route.path, 'DELETE'),
      submissionParams
    );

    expect(response.status).toBe(403);
    expect(fixture.writes).toEqual([]);
  });

  it('forbids a manager whose role is disabled', async () => {
    mocks.getUser.mockReturnValue(owner);
    mocks.getRole.mockResolvedValue({ ...managerRole, enabled: false });
    const { DELETE, PUT } = await route.load();

    const put = await PUT(
      jsonRequest(route.path, 'PUT', route.body),
      submissionParams
    );
    const del = await DELETE(
      jsonRequest(route.path, 'DELETE'),
      submissionParams
    );

    expect([put.status, del.status]).toEqual([403, 403]);
    expect(fixture.writes).toEqual([]);
  });

  it("lets a challenge manager grade another user's submission", async () => {
    mocks.getUser.mockReturnValue(manager);
    mocks.getRole.mockResolvedValue(managerRole);
    const { PUT } = await route.load();
    const response = await PUT(
      jsonRequest(route.path, 'PUT', route.body),
      submissionParams
    );

    expect(response.status).toBe(201);
    expect(fixture.writes).toEqual([
      expect.objectContaining({
        operation: 'upsert',
        payload: expect.objectContaining({ submission_id: 'submission-1' }),
        table: route.table,
      }),
    ]);
  });

  it('lets a manager of only this challenge clear its grading', async () => {
    mocks.getUser.mockReturnValue(manager);
    mocks.getRole.mockResolvedValue({
      ...participantRole,
      allow_challenge_management: true,
    });
    fixture.tables.nova_challenge_manager_emails = [
      { challenge_id: 'challenge-1', email: manager.email },
    ];
    const { DELETE } = await route.load();
    const response = await DELETE(
      jsonRequest(route.path, 'DELETE'),
      submissionParams
    );

    expect(response.status).toBe(200);
    expect(fixture.writes).toEqual([
      expect.objectContaining({
        filters: [['submission_id', 'submission-1']],
        operation: 'delete',
        table: route.table,
      }),
    ]);
  });

  it('forbids a manager of a different challenge', async () => {
    mocks.getUser.mockReturnValue(manager);
    mocks.getRole.mockResolvedValue({
      ...participantRole,
      allow_challenge_management: true,
    });
    fixture.tables.nova_challenge_manager_emails = [
      { challenge_id: 'challenge-2', email: manager.email },
    ];
    const { PUT } = await route.load();
    const response = await PUT(
      jsonRequest(route.path, 'PUT', route.body),
      submissionParams
    );

    expect(response.status).toBe(403);
    expect(fixture.writes).toEqual([]);
  });

  it("rejects a grade target outside the submission's problem", async () => {
    mocks.getUser.mockReturnValue(manager);
    mocks.getRole.mockResolvedValue(managerRole);
    const { PUT } = await route.load();
    const response = await PUT(
      jsonRequest(route.path, 'PUT', route.crossBody),
      submissionParams
    );

    expect(response.status).toBe(400);
    expect(fixture.writes).toEqual([]);
  });

  it('returns 404 for an unknown submission', async () => {
    mocks.getUser.mockReturnValue(manager);
    mocks.getRole.mockResolvedValue(managerRole);
    const { DELETE } = await route.load();
    const response = await DELETE(jsonRequest(route.path, 'DELETE'), {
      params: Promise.resolve({ submissionId: 'missing' }),
    });

    expect(response.status).toBe(404);
    expect(fixture.writes).toEqual([]);
  });
});
