import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  managerRole,
  participantRole,
  submissionAccessFixture,
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
  getNovaPlatformRole: (...args: unknown[]) => mocks.getRole(...args),
  requireNovaAppSessionUser: () => mocks.getUser(),
}));

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => undefined,
}));

vi.mock('./client', () => ({ default: () => null }));

const manager = { email: 'manager@example.com', id: 'manager-1' };
const owner = { email: 'owner@example.com', id: 'user-1' };
const assignedManagerRole = {
  ...participantRole,
  allow_challenge_management: true,
};

let fixture: ReturnType<typeof submissionAccessFixture>;

const render = async () => {
  const { default: Page } = await import('./page');
  return Page({ params: Promise.resolve({ submissionId: 'submission-1' }) });
};

function assignManager(challengeId: string) {
  mocks.getUser.mockResolvedValue(manager);
  mocks.getRole.mockResolvedValue(assignedManagerRole);
  fixture.tables.nova_challenge_manager_emails = [
    { challenge_id: challengeId, email: manager.email },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  fixture = submissionAccessFixture();
  Object.assign(fixture.tables, {
    nova_challenges: [
      {
        id: 'challenge-1',
        title: 'Private challenge',
        description: 'Private',
        duration: 3600,
        enabled: true,
        password_hash: 'dummy-hash',
        password_salt: 'dummy-salt',
      },
    ],
    nova_sessions: [
      { id: 'session-1', user_id: 'user-1', challenge_id: 'challenge-1' },
      { id: 'session-other', user_id: 'user-1', challenge_id: 'challenge-2' },
    ],
    nova_submissions_with_scores: [
      {
        id: 'submission-1',
        problem_id: 'problem-1',
        session_id: 'session-1',
        user_id: 'user-1',
      },
    ],
    users: [
      { id: 'user-1', display_name: 'Owner', avatar_url: null },
      { id: 'manager-1', display_name: 'Manager', avatar_url: null },
    ],
  });
  mocks.createAdminClient.mockResolvedValue(fixture.client);
  mocks.getUser.mockResolvedValue(owner);
  mocks.getRole.mockResolvedValue(participantRole);
});

describe('Nova submission detail page access', () => {
  it("hides another challenge's submission from an assigned manager", async () => {
    assignManager('challenge-2');
    await expect(render()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('hides a sessionless own submission on a challenge the manager does not manage', async () => {
    assignManager('challenge-2');
    fixture.tables.nova_submissions_with_scores = [
      {
        id: 'submission-1',
        problem_id: 'problem-1',
        session_id: null,
        user_id: manager.id,
      },
    ];
    await expect(render()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('hides submissions from a manager whose role is disabled', async () => {
    mocks.getUser.mockResolvedValue(manager);
    mocks.getRole.mockResolvedValue({ ...managerRole, enabled: false });
    await expect(render()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it("hides an owner's submission bound to a session in another challenge", async () => {
    fixture.tables.nova_submissions_with_scores = [
      {
        id: 'submission-1',
        problem_id: 'problem-1',
        session_id: 'session-other',
        user_id: 'user-1',
      },
    ];
    await expect(render()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('shows a manager of the challenge the submission without password verifiers', async () => {
    assignManager('challenge-1');
    const element = await render();
    const challenge = element?.props.submission.challenge;

    expect(challenge).toMatchObject({
      id: 'challenge-1',
      password_hash: null,
      password_salt: null,
    });
  });

  it('shows the owner their submission from their own session', async () => {
    const element = await render();

    expect(element?.props.submission).toMatchObject({
      id: 'submission-1',
      problem: { id: 'problem-1' },
    });
    expect(element?.props.submission.challenge).toMatchObject({
      password_hash: null,
      password_salt: null,
    });
  });
});
