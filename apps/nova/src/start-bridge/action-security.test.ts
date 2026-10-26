import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addWhitelistEmail } from '../app/[locale]/(dashboard)/(admin)/(role-management)/users/whitelist/actions';
import { fetchAllProblems } from '../app/[locale]/(dashboard)/challenges/[challengeId]/results/actions';
import { getFullSubmission } from '../app/[locale]/(dashboard)/shared/actions';
import {
  participantRole,
  submissionAccessFixture,
} from '../lib/submission-access-test-fixture';

const mocks = vi.hoisted(() => ({
  actor: { id: 'user-1', email: 'participant@example.test' } as {
    id: string;
    email: string;
  } | null,
  role: {
    enabled: true,
    allow_role_management: false,
    allow_challenge_management: false,
    allow_manage_all_challenges: false,
  },
  admin: vi.fn(),
  insert: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@/lib/app-session', () => ({
  getNovaAppSessionUserFromHeaders: async () => mocks.actor,
  requireNovaAppSessionUser: async () => {
    if (!mocks.actor) throw new Error('Unauthorized');
    return mocks.actor;
  },
  getNovaPlatformRole: async () => mocks.role,
}));

let fixture: ReturnType<typeof submissionAccessFixture>;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor = { id: 'user-1', email: 'participant@example.test' };
  mocks.role = { ...participantRole };
  mocks.insert.mockResolvedValue({ error: null });
  fixture = submissionAccessFixture();
  fixture.tables.nova_sessions = [
    { id: 'session-1', user_id: 'user-1', challenge_id: 'challenge-1' },
  ];
  mocks.admin.mockResolvedValue({
    schema: () => fixture.client,
    from: (table: string) =>
      table === 'platform_email_roles'
        ? { insert: mocks.insert }
        : fixture.client.from(table),
  });
});

describe('Nova callable authorization before native exposure', () => {
  it('denies unsigned whitelist writes before using the admin client', async () => {
    mocks.actor = null;
    await expect(addWhitelistEmail('new@example.test', false)).rejects.toThrow(
      'Unauthorized'
    );
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('denies non-managers and disabled role managers', async () => {
    await expect(addWhitelistEmail('new@example.test', false)).rejects.toThrow(
      'Forbidden'
    );
    mocks.role = { ...mocks.role, allow_role_management: true, enabled: false };
    await expect(addWhitelistEmail('new@example.test', false)).rejects.toThrow(
      'Forbidden'
    );
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('preserves an enabled role manager whitelist write', async () => {
    mocks.role = { ...mocks.role, allow_role_management: true };
    await expect(addWhitelistEmail('new@example.test', false)).resolves.toEqual(
      {
        success: true,
      }
    );
    expect(mocks.insert).toHaveBeenCalledWith([
      {
        email: 'new@example.test',
        enabled: false,
        allow_challenge_management: false,
        allow_manage_all_challenges: false,
        allow_role_management: false,
      },
    ]);
  });

  it('denies a caller-supplied foreign results user', async () => {
    await expect(fetchAllProblems('challenge-1', 'user-2')).rejects.toThrow(
      'Forbidden'
    );
  });

  it('does not disclose problems to an actor without a session', async () => {
    fixture.tables.nova_sessions = [];
    await expect(fetchAllProblems('challenge-1', 'user-1')).rejects.toThrow(
      'Forbidden'
    );
  });

  it('denies a foreign submission and a participant requesting hidden cases', async () => {
    mocks.actor = { id: 'user-2', email: 'other@example.test' };
    await expect(getFullSubmission('submission-1')).rejects.toThrow(
      'Forbidden'
    );
    mocks.actor = { id: 'user-1', email: 'participant@example.test' };
    await expect(getFullSubmission('submission-1', true)).rejects.toThrow(
      'Forbidden'
    );
  });

  it('preserves an owner visible submission and a manager hidden-case read', async () => {
    await expect(getFullSubmission('submission-1')).resolves.toEqual({
      test_cases: [],
      criteria: [],
    });
    mocks.role = { ...mocks.role, allow_manage_all_challenges: true };
    await expect(getFullSubmission('submission-1', true)).resolves.toEqual({
      test_cases: [],
      criteria: [],
    });
  });
});
