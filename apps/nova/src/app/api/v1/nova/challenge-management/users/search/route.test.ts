import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  canManageGlobally: vi.fn(),
  connection: vi.fn(),
  createAdminClient: vi.fn(),
  getSessionUser: vi.fn(),
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: mocks.connection,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@/lib/app-session', () => ({
  getNovaAppSessionUserFromRequest: mocks.getSessionUser,
}));

vi.mock('@/lib/challenge-management-auth', () => ({
  canManageNovaChallengesGlobally: mocks.canManageGlobally,
}));

import { escapePostgrestLikePattern, GET } from './route';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const SELECTED_USER_ID = '22222222-2222-4222-8222-222222222222';

function request(query = '') {
  return new Request(
    `https://nova.tuturuuu.com/api/v1/nova/challenge-management/users/search${query}`
  );
}

function userRow(id = USER_ID, email = 'learner@example.test') {
  return {
    display_name: 'Learner',
    id,
    user_private_details: { email },
  };
}

function createAdmin({
  searchData = [userRow()],
  searchError = null,
  selectedData = null,
  selectedError = null,
  selectedOnly = false,
}: {
  searchData?: unknown[];
  searchError?: unknown;
  selectedData?: unknown;
  selectedError?: unknown;
  selectedOnly?: boolean;
} = {}) {
  const searchQuery = {
    ilike: vi.fn(() => searchQuery),
    limit: vi.fn(async () => ({ data: searchData, error: searchError })),
    order: vi.fn(() => searchQuery),
    select: vi.fn(() => searchQuery),
  };
  const selectedQuery = {
    eq: vi.fn(() => selectedQuery),
    maybeSingle: vi.fn(async () => ({
      data: selectedData,
      error: selectedError,
    })),
    select: vi.fn(() => selectedQuery),
  };
  const queries = selectedOnly ? [selectedQuery] : [searchQuery, selectedQuery];
  const admin = {
    from: vi.fn(() => {
      const query = queries.shift();
      if (!query) throw new Error('Unexpected users query');
      return query;
    }),
  };

  return { admin, searchQuery, selectedQuery };
}

describe('Nova submission user search route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.connection.mockResolvedValue(undefined);
    mocks.getSessionUser.mockReturnValue({ id: USER_ID });
    mocks.canManageGlobally.mockResolvedValue(true);
  });

  it.each([
    ['anonymous', null],
    ['unrelated app target', null],
  ])(
    'denies an %s request before capability or admin access',
    async (_, user) => {
      mocks.getSessionUser.mockReturnValue(user);

      const response = await GET(request('?q=learner'));

      expect(response.status).toBe(401);
      expect(mocks.canManageGlobally).not.toHaveBeenCalled();
      expect(mocks.createAdminClient).not.toHaveBeenCalled();
    }
  );

  it.each(['assigned-only manager', 'disabled manager'])(
    'denies a %s before private-email admin access',
    async () => {
      mocks.canManageGlobally.mockResolvedValue(false);

      const response = await GET(request('?q=learner'));

      expect(response.status).toBe(403);
      expect(mocks.createAdminClient).not.toHaveBeenCalled();
    }
  );

  it('returns an empty bounded response without a private query', async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [], selected: null });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it.each(['?q=x', '?q=%25__', `?q=${'a'.repeat(101)}`])(
    'rejects an invalid or unbounded term %s without a private query',
    async (query) => {
      const response = await GET(request(query));

      expect(response.status).toBe(400);
      expect(mocks.createAdminClient).not.toHaveBeenCalled();
    }
  );

  it('escapes wildcards, orders deterministically, and truncates to 20', async () => {
    const rows = Array.from({ length: 21 }, (_, index) =>
      userRow(`${String(index).padStart(8, '0')}-1111-4111-8111-111111111111`)
    );
    const { admin, searchQuery } = createAdmin({ searchData: rows });
    mocks.createAdminClient.mockResolvedValue(admin);

    const response = await GET(request('?q=learn%25_er'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(20);
    expect(searchQuery.ilike).toHaveBeenCalledWith(
      'user_private_details.email',
      '%learn\\%\\_er%'
    );
    expect(searchQuery.order).toHaveBeenNthCalledWith(1, 'email', {
      ascending: true,
      referencedTable: 'user_private_details',
    });
    expect(searchQuery.order).toHaveBeenNthCalledWith(2, 'id', {
      ascending: true,
    });
    expect(searchQuery.limit).toHaveBeenCalledWith(20);
  });

  it('returns one exact selected projection alongside search results', async () => {
    const selected = userRow(SELECTED_USER_ID, 'selected@example.test');
    const { admin, selectedQuery } = createAdmin({ selectedData: selected });
    mocks.createAdminClient.mockResolvedValue(admin);

    const response = await GET(
      request(`?q=learner&selectedUserId=${SELECTED_USER_ID}`)
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      selected: {
        email: 'selected@example.test',
        id: SELECTED_USER_ID,
      },
    });
    expect(selectedQuery.eq).toHaveBeenCalledWith('id', SELECTED_USER_ID);
  });

  it('resolves a selected deep link without running a broad search', async () => {
    const selected = userRow(SELECTED_USER_ID, 'selected@example.test');
    const { admin, selectedQuery } = createAdmin({
      selectedData: selected,
      selectedOnly: true,
    });
    mocks.createAdminClient.mockResolvedValue(admin);

    const response = await GET(request(`?selectedUserId=${SELECTED_USER_ID}`));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [],
      selected: {
        display_name: 'Learner',
        email: 'selected@example.test',
        id: SELECTED_USER_ID,
      },
    });
    expect(selectedQuery.eq).toHaveBeenCalledWith('id', SELECTED_USER_ID);
  });

  it('returns a sanitized 500 when a private query fails', async () => {
    const { admin } = createAdmin({
      searchError: new Error('synthetic private detail'),
    });
    mocks.createAdminClient.mockResolvedValue(admin);

    const response = await GET(request('?q=learner'));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ message: 'Failed to search users' });
    expect(JSON.stringify(body)).not.toContain('synthetic private detail');
  });

  it('escapes PostgREST wildcard characters', () => {
    expect(escapePostgrestLikePattern('a%b_c\\d')).toBe('a\\%b\\_c\\\\d');
  });
});
