import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getNovaAppSessionUserFromRequest } from '@/lib/app-session';

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/app-session', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/app-session')>(
      '@/lib/app-session'
    );

  return {
    ...actual,
    getNovaAppSessionUserFromRequest: vi.fn(),
  };
});

type Role = {
  allow_challenge_management: boolean;
  allow_manage_all_challenges: boolean;
  allow_role_management: boolean;
  enabled: boolean;
};

type MockAdminOptions = {
  manageableChallenges?: string[];
  role?: Role | null;
};

function createMockAdminClient({
  manageableChallenges = [],
  role = {
    allow_challenge_management: false,
    allow_manage_all_challenges: false,
    allow_role_management: false,
    enabled: true,
  },
}: MockAdminOptions = {}) {
  const operations: string[] = [];

  const client = {
    from(table: string) {
      const filters: Record<string, unknown> = {};

      const builder = {
        delete() {
          operations.push(`${table}.delete`);
          return builder;
        },
        eq(column: string, value: unknown) {
          filters[column] = value;
          return builder;
        },
        insert() {
          operations.push(`${table}.insert`);
          return builder;
        },
        maybeSingle: async () => {
          if (table === 'platform_user_roles') {
            return { data: role, error: null };
          }

          if (table === 'nova_challenge_manager_emails') {
            const challengeId = String(filters.challenge_id);
            return {
              data: manageableChallenges.includes(challengeId)
                ? { challenge_id: challengeId }
                : null,
              error: null,
            };
          }

          return { data: null, error: null };
        },
        select() {
          return builder;
        },
        single: async () => ({
          data: { id: filters.id ?? 'row-id' },
          error: null,
        }),
        update() {
          operations.push(`${table}.update`);
          return builder;
        },
        upsert() {
          operations.push(`${table}.upsert`);
          return builder;
        },
      };

      return builder;
    },
  };

  return { client, operations };
}

describe('Nova challenge-management API RBAC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getNovaAppSessionUserFromRequest).mockReturnValue({
      app_metadata: {},
      aud: 'authenticated',
      created_at: '',
      email: 'user@example.com',
      id: 'user-1',
      user_metadata: {},
    });
  });

  it('rejects non-manager challenge updates before touching nova_challenges', async () => {
    const { client, operations } = createMockAdminClient();
    vi.mocked(createAdminClient).mockResolvedValue(client as never);

    const { PUT } = await import('../challenges/[challengeId]/route');
    const response = await PUT(
      new Request('https://nova.test/api/v1/challenges/challenge-1', {
        body: JSON.stringify({ title: 'Updated' }),
        method: 'PUT',
      }),
      { params: Promise.resolve({ challengeId: 'challenge-1' }) }
    );

    expect(response.status).toBe(403);
    expect(operations).not.toContain('nova_challenges.update');
  });

  it('rejects non-manager problem creation before touching nova_problems', async () => {
    const { client, operations } = createMockAdminClient();
    vi.mocked(createAdminClient).mockResolvedValue(client as never);

    const { POST } = await import('../problems/route');
    const response = await POST(
      new Request('https://nova.test/api/v1/problems', {
        body: JSON.stringify({
          challengeId: 'challenge-1',
          description: 'Problem description',
          exampleInput: 'input',
          exampleOutput: 'output',
          maxPromptLength: 1000,
          title: 'Problem',
        }),
        method: 'POST',
      })
    );

    expect(response.status).toBe(403);
    expect(operations).not.toContain('nova_problems.insert');
  });

  it('rejects non-manager whitelist writes before touching whitelist rows', async () => {
    const { client, operations } = createMockAdminClient();
    vi.mocked(createAdminClient).mockResolvedValue(client as never);

    const { POST } = await import(
      '../challenges/[challengeId]/whitelists/route'
    );
    const response = await POST(
      new Request(
        'https://nova.test/api/v1/challenges/challenge-1/whitelists',
        {
          body: JSON.stringify({ email: 'candidate@example.com' }),
          method: 'POST',
        }
      ),
      { params: Promise.resolve({ challengeId: 'challenge-1' }) }
    );

    expect(response.status).toBe(403);
    expect(operations).not.toContain(
      'nova_challenge_whitelisted_emails.upsert'
    );
  });

  it('allows a challenge-specific manager to update their managed challenge', async () => {
    const { client, operations } = createMockAdminClient({
      manageableChallenges: ['challenge-1'],
      role: {
        allow_challenge_management: true,
        allow_manage_all_challenges: false,
        allow_role_management: false,
        enabled: true,
      },
    });
    vi.mocked(createAdminClient).mockResolvedValue(client as never);

    const { PUT } = await import('../challenges/[challengeId]/route');
    const response = await PUT(
      new Request('https://nova.test/api/v1/challenges/challenge-1', {
        body: JSON.stringify({ title: 'Updated' }),
        method: 'PUT',
      }),
      { params: Promise.resolve({ challengeId: 'challenge-1' }) }
    );

    expect(response.status).toBe(200);
    expect(operations).toContain('nova_challenges.update');
  });
});
