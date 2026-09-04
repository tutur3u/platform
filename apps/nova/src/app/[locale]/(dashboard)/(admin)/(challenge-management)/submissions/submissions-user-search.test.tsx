import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  canManageGlobally: vi.fn(),
  createAdminClient: vi.fn(),
  redirect: vi.fn(),
  requireSessionUser: vi.fn(),
  searchUsers: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}));

vi.mock('@/lib/app-session', () => ({
  requireNovaAppSessionUser: mocks.requireSessionUser,
}));

vi.mock('@/lib/challenge-management-auth', () => ({
  canManageNovaChallengesGlobally: mocks.canManageGlobally,
}));

vi.mock('@tuturuuu/internal-api', () => ({
  searchNovaSubmissionUsers: mocks.searchUsers,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('./filters', () => ({
  SubmissionFilters: () => <div data-testid="submission-filters" />,
}));

vi.mock('./overview', () => ({
  SubmissionOverview: () => <div data-testid="submission-overview" />,
}));

vi.mock('./submission-table', () => ({
  SubmissionTable: () => <div data-testid="submission-table" />,
}));

import SubmissionsList, { parseSubmissionPagination } from './server-component';
import {
  mergeSubmissionUserOptions,
  NovaSubmissionUserSearch,
  novaSubmissionUserSearchQueryKey,
} from './submission-user-search';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function createAdmin() {
  const orderedResult = (data: unknown[]) => ({
    order: vi.fn(async () => ({ data, error: null })),
    select: vi.fn(() => orderedResult(data)),
  });
  const submissionsQuery = {
    order: vi.fn(() => submissionsQuery),
    range: vi.fn(async () => ({ count: 0, data: [], error: null })),
    select: vi.fn(() => submissionsQuery),
  };
  const privateFrom = vi.fn((table: string) => {
    if (table === 'nova_challenges') return orderedResult([]);
    if (table === 'nova_problems') return orderedResult([]);
    if (table === 'nova_submissions_with_scores') return submissionsQuery;
    throw new Error(`Unexpected private table ${table}`);
  });

  return {
    from: vi.fn(() => {
      throw new Error('Global user directory must not be loaded');
    }),
    rpc: vi.fn(async () => ({
      data: [
        {
          latest_submission_date: null,
          total_count: 0,
          unique_users_count: 0,
        },
      ],
      error: null,
    })),
    schema: vi.fn(() => ({ from: privateFrom })),
  };
}

describe('Nova submission user search boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSessionUser.mockResolvedValue({ id: USER_ID });
    mocks.canManageGlobally.mockResolvedValue(true);
    mocks.searchUsers.mockResolvedValue({ data: [], selected: null });
    mocks.redirect.mockImplementation(() => {
      throw new Error('NEXT_REDIRECT');
    });
  });

  it.each([
    [{}, { currentPage: 1, pageSize: 10 }],
    [
      { page: '-2', pageSize: '1000000' },
      { currentPage: 1, pageSize: 10 },
    ],
    [
      { page: '2.5', pageSize: '20' },
      { currentPage: 1, pageSize: 20 },
    ],
    [
      { page: '3', pageSize: '50' },
      { currentPage: 3, pageSize: 50 },
    ],
  ])('clamps pagination inputs %#', (input, expected) => {
    expect(parseSubmissionPagination(input)).toEqual(expected);
  });

  it('isolates stale search responses by term and selected user', () => {
    expect(novaSubmissionUserSearchQueryKey('alpha', USER_ID)).not.toEqual(
      novaSubmissionUserSearchQueryKey('beta', USER_ID)
    );
    expect(novaSubmissionUserSearchQueryKey('alpha', USER_ID)).not.toEqual(
      novaSubmissionUserSearchQueryKey('alpha', 'different-user')
    );
  });

  it('keeps one selected deep-link projection without duplicating results', () => {
    const selected = {
      display_name: 'Selected',
      email: 'selected@example.test',
      id: USER_ID,
    };

    expect(mergeSubmissionUserOptions([], selected)).toEqual([selected]);
    expect(mergeSubmissionUserOptions([selected], selected)).toEqual([
      selected,
    ]);
  });

  it('loads and labels a selected deep-link user without a search term', async () => {
    mocks.searchUsers.mockResolvedValue({
      data: [],
      selected: {
        display_name: 'Selected',
        email: 'selected@example.test',
        id: USER_ID,
      },
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <NovaSubmissionUserSearch
          onUserChange={vi.fn()}
          selectedUserId={USER_ID}
        />
      </QueryClientProvider>
    );

    await waitFor(() =>
      expect(screen.getByPlaceholderText('selected@example.test')).toBeTruthy()
    );
    expect(mocks.searchUsers).toHaveBeenCalledWith({
      q: undefined,
      selectedUserId: USER_ID,
    });
  });

  it('denies assigned-only managers before submission and directory reads', async () => {
    const admin = createAdmin();
    mocks.createAdminClient.mockResolvedValue(admin);
    mocks.canManageGlobally.mockResolvedValue(false);

    await expect(
      SubmissionsList({ searchParams: Promise.resolve({}) })
    ).rejects.toThrow('NEXT_REDIRECT');

    expect(admin.rpc).not.toHaveBeenCalled();
    expect(admin.schema).not.toHaveBeenCalled();
    expect(admin.from).not.toHaveBeenCalled();
  });

  it('allows a global manager without loading the global user directory', async () => {
    const admin = createAdmin();
    mocks.createAdminClient.mockResolvedValue(admin);

    render(await SubmissionsList({ searchParams: Promise.resolve({}) }));

    expect(mocks.canManageGlobally).toHaveBeenCalledWith(
      { id: USER_ID },
      admin
    );
    expect(admin.from).not.toHaveBeenCalled();
    expect(screen.getByTestId('submission-filters')).toBeTruthy();
    expect(screen.getByTestId('submission-table')).toBeTruthy();
  });
});
