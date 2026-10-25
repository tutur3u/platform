export function permissionFixture() {
  const state = {
    // Platform role row read by the pre-scoping implementation.
    manager: false,
    managerEnabled: true,
    // Challenges the injected canManageChallenge callback reports as managed.
    managedChallenges: [] as string[],
    // Assigned-manager membership row read by Nova's canManageNovaChallenge.
    managerEmail: null as { challenge_id: string; email: string } | null,
    session: {
      id: 'session-1',
      user_id: 'user-1',
      challenge_id: 'challenge-1',
      status: 'IN_PROGRESS',
      start_time: '2026-10-25T03:00:00.000Z',
    },
    problem: { id: 'problem-1', challenge_id: 'challenge-1' },
    challenge: {
      id: 'challenge-1',
      duration: 3600,
      close_at: null as string | null,
    },
    inserts: [] as unknown[],
  };
  const client = {
    schema: () => client,
    from: (table: string) => {
      const filters: Array<[string, unknown]> = [];
      const result = () => {
        const row =
          table === 'nova_sessions'
            ? state.session
            : table === 'nova_problems'
              ? state.problem
              : table === 'nova_challenges'
                ? state.challenge
                : table === 'nova_submissions'
                  ? { id: 'submission-1' }
                  : table === 'nova_challenge_manager_emails'
                    ? state.managerEmail
                    : table === 'platform_user_roles' && state.manager
                      ? {
                          user_id: 'user-1',
                          allow_challenge_management: true,
                          enabled: state.managerEnabled,
                        }
                      : null;
        const matches =
          row &&
          filters.every(
            ([column, value]) =>
              column in row && Reflect.get(row, column) === value
          );
        return { data: matches ? row : null, error: null, count: 0 };
      };
      const builder = {
        eq: (column: string, value: unknown) => {
          filters.push([column, value]);
          return builder;
        },
        maybeSingle: async () => result(),
        select: () => builder,
        insert: (value: unknown) => {
          state.inserts.push(value);
          return builder;
        },
        single: async () => result(),
        // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are intentionally thenable.
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(result()).then(resolve),
      };
      return builder;
    },
  };
  const canManageChallenge = async (challengeId: string) =>
    state.managedChallenges.includes(challengeId);
  return { canManageChallenge, client, state };
}

export const deniedSessionCases = [
  'another user',
  'another challenge',
  'ended',
  'duration expiry',
  'close expiry',
  'future start',
] as const;

export function denySession(
  fixture: ReturnType<typeof permissionFixture>,
  scenario: (typeof deniedSessionCases)[number]
) {
  switch (scenario) {
    case 'another user':
      fixture.state.session.user_id = 'user-2';
      break;
    case 'another challenge':
      fixture.state.problem.challenge_id = 'challenge-2';
      break;
    case 'ended':
      fixture.state.session.status = 'ENDED';
      break;
    case 'duration expiry':
      fixture.state.session.start_time = '2026-10-25T02:30:00.000Z';
      break;
    case 'close expiry':
      fixture.state.challenge.close_at = '2026-10-25T03:30:00.000Z';
      break;
    case 'future start':
      fixture.state.session.start_time = '2026-10-25T03:31:00.000Z';
      break;
  }
}
