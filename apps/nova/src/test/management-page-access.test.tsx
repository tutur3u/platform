import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  manage: vi.fn(),
  global: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    from: state.from,
    rpc: state.rpc,
    schema: () => ({ from: state.from }),
  }),
}));
vi.mock('@/lib/app-session', () => ({
  requireNovaAppSessionUser: async () => ({
    id: 'manager',
    email: 'manager@example.test',
  }),
}));
vi.mock('@/lib/challenge-management-auth', () => ({
  canManageNovaChallenge: state.manage,
  canManageNovaChallengesGlobally: state.global,
  getNovaProblemChallengeId: async () => ({
    challengeId: 'other-challenge',
    error: null,
  }),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not-found');
  },
  redirect: () => {
    throw new Error('redirect');
  },
}));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('@tuturuuu/icons', () => ({ ArrowLeft: () => null }));
vi.mock('@tuturuuu/ui/button', () => ({ Button: () => null }));
vi.mock('@tuturuuu/ui/card', () => ({
  Card: () => null,
  CardContent: () => null,
}));
vi.mock('@tuturuuu/ui/tabs', () => ({
  Tabs: () => null,
  TabsContent: () => null,
  TabsList: () => null,
  TabsTrigger: () => null,
}));
vi.mock(
  '../app/[locale]/(dashboard)/(admin)/(challenge-management)/sessions/filters',
  () => ({ SessionFilters: () => null })
);
vi.mock(
  '../app/[locale]/(dashboard)/(admin)/(challenge-management)/sessions/overview',
  () => ({ SessionOverview: () => null })
);
vi.mock(
  '../app/[locale]/(dashboard)/(admin)/(challenge-management)/sessions/session-table',
  () => ({ SessionTable: () => null })
);
vi.mock(
  '../app/[locale]/(dashboard)/(admin)/(challenge-management)/sessions/[sessionId]/client',
  () => ({ default: () => null })
);
vi.mock('../app/[locale]/(dashboard)/shared/problem-component', () => ({
  default: () => null,
}));
vi.mock('../app/[locale]/(dashboard)/shared/prompt-component', () => ({
  default: () => null,
}));
vi.mock('../app/[locale]/(dashboard)/shared/prompt-form', () => ({
  default: () => null,
}));
vi.mock('../app/[locale]/(dashboard)/shared/test-case-component', () => ({
  default: () => null,
}));

import Problem from '../app/[locale]/(dashboard)/(admin)/(challenge-management)/problems/[problemId]/page';
import Session from '../app/[locale]/(dashboard)/(admin)/(challenge-management)/sessions/[sessionId]/page';
import Sessions from '../app/[locale]/(dashboard)/(admin)/(challenge-management)/sessions/server-component';

beforeEach(() => {
  state.manage.mockReset().mockResolvedValue(false);
  state.global.mockReset().mockResolvedValue(false);
  state.rpc.mockReset().mockImplementation(() => {
    throw new Error('protected statistics');
  });
  state.from.mockReset().mockImplementation((_table: string) => {
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      is: () => query,
      gte: () => query,
      lte: () => query,
      single: async () => ({
        data: {
          id: 'row',
          challenge_id: 'other-challenge',
          user_id: 'participant',
          start_time: '2026-10-26T00:00:00Z',
          created_at: '2026-10-26T00:00:00Z',
        },
        error: null,
      }),
      // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are awaitable.
      then: (resolve: (value: unknown) => void) =>
        resolve({ data: [], error: null }),
    };
    return query;
  });
});
it('denies the global sessions list to a delegated manager before statistics', async () => {
  await expect(Sessions({ searchParams: Promise.resolve({}) })).rejects.toThrow(
    'redirect'
  );
  expect(state.rpc).not.toHaveBeenCalled();
});
it('denies another challenge session before participant details', async () => {
  await expect(
    Session({ params: Promise.resolve({ sessionId: 'session' }) })
  ).rejects.toThrow('not-found');
  expect(state.from).not.toHaveBeenCalledWith('users');
  expect(state.from).not.toHaveBeenCalledWith('user_private_details');
});
it('denies another challenge problem before hidden test cases', async () => {
  await expect(
    Problem({ params: Promise.resolve({ problemId: 'problem' }) })
  ).rejects.toThrow('not-found');
  expect(state.from).not.toHaveBeenCalledWith('nova_problem_test_cases');
});

it('preserves an assigned challenge session', async () => {
  state.manage.mockResolvedValue(true);
  await expect(
    Session({ params: Promise.resolve({ sessionId: 'session' }) })
  ).resolves.toBeTruthy();
  expect(state.manage).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'manager' }),
    'other-challenge',
    expect.anything()
  );
});
it('preserves an assigned challenge problem', async () => {
  state.manage.mockResolvedValue(true);
  await expect(
    Problem({ params: Promise.resolve({ problemId: 'problem' }) })
  ).resolves.toBeTruthy();
  expect(state.from).toHaveBeenCalledWith('nova_problem_test_cases');
});
it('admits a global manager to the sessions overview queries', async () => {
  state.global.mockResolvedValue(true);
  await expect(Sessions({ searchParams: Promise.resolve({}) })).rejects.toThrow(
    'protected statistics'
  );
  expect(state.rpc).toHaveBeenCalledWith('get_session_statistics');
});
