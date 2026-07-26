import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createWorkspaceExternalProjectEntry: vi.fn(),
  resolveWorkspaceExternalProjectBinding: vi.fn(),
  verifyExternalAppSecret: vi.fn(),
  verifyTurnstileToken: vi.fn(),
}));

class FakeTurnstileError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

vi.mock('@tuturuuu/turnstile', () => ({
  isTurnstileError: (error: unknown) => error instanceof FakeTurnstileError,
  verifyTurnstileToken: (
    ...args: Parameters<typeof mocks.verifyTurnstileToken>
  ) => mocks.verifyTurnstileToken(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => mocks.createAdminClient(),
}));

vi.mock('@/lib/app-coordination/external-apps', () => ({
  verifyExternalAppSecret: (
    ...args: Parameters<typeof mocks.verifyExternalAppSecret>
  ) => mocks.verifyExternalAppSecret(...args),
}));

vi.mock('@/lib/external-projects/access', () => ({
  resolveWorkspaceExternalProjectBinding: (
    ...args: Parameters<typeof mocks.resolveWorkspaceExternalProjectBinding>
  ) => mocks.resolveWorkspaceExternalProjectBinding(...args),
}));

vi.mock('@/lib/external-projects/store', () => ({
  createWorkspaceExternalProjectEntry: (
    ...args: Parameters<typeof mocks.createWorkspaceExternalProjectEntry>
  ) => mocks.createWorkspaceExternalProjectEntry(...args),
}));

const WS = 'e7ff0d3f-5260-420c-989f-58ffa9843724';

type EntryQuery = {
  filters: Record<string, unknown>;
  limit: number | null;
};

/**
 * Minimal PostgREST-ish double: records the filters the route applies so the
 * test can assert the status filter reaches the query rather than being
 * applied in memory (which would silently forward already-sent responses).
 */
function createAdmin({
  collection,
  entries,
  query,
}: {
  collection: { id: string } | null;
  entries: unknown[];
  query: EntryQuery;
}) {
  return {
    from(table: string) {
      if (table === 'workspace_external_project_collections') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: collection, error: null }),
              }),
            }),
          }),
        };
      }

      const builder = {
        eq(column: string, value: unknown) {
          query.filters[column] = value;
          return builder;
        },
        order() {
          return builder;
        },
        limit(value: number) {
          query.limit = value;
          return Promise.resolve({ data: entries, error: null });
        },
      };

      return { select: () => builder };
    },
  };
}

function request(headers: Record<string, string>, search = '') {
  return new Request(
    `https://tuturuuu.com/api/v1/workspaces/${WS}/external-projects/submissions${search}`,
    { headers }
  );
}

const params = { params: Promise.resolve({ wsId: WS }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.verifyExternalAppSecret.mockResolvedValue({
    app: { id: 'richfield' },
    ok: true,
  });
  mocks.resolveWorkspaceExternalProjectBinding.mockResolvedValue({
    adapter: 'richfield',
    enabled: true,
  });
});

describe('GET external-project submissions', () => {
  it('rejects a request with no app secret header', async () => {
    mocks.createAdminClient.mockResolvedValue({});
    const { GET } = await import('./route');

    const response = await GET(request({ 'x-app-id': 'richfield' }), params);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Missing x-app-secret header',
    });
    expect(mocks.verifyExternalAppSecret).not.toHaveBeenCalled();
  });

  it('rejects an unknown email notification status instead of silently defaulting', async () => {
    mocks.createAdminClient.mockResolvedValue({});
    const { GET } = await import('./route');

    const response = await GET(
      request(
        { 'x-app-id': 'richfield', 'x-app-secret': 'secret' },
        '?emailNotificationStatus=everything'
      ),
      params
    );

    expect(response.status).toBe(400);
  });

  it('returns an empty inbox when the collection does not exist yet', async () => {
    mocks.createAdminClient.mockResolvedValue(
      createAdmin({
        collection: null,
        entries: [],
        query: { filters: {}, limit: null },
      })
    );
    const { GET } = await import('./route');

    const response = await GET(
      request({ 'x-app-id': 'richfield', 'x-app-secret': 'secret' }),
      params
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ submissions: [] });
  });

  it('filters to pending submissions in the query and caps the page size', async () => {
    const query: EntryQuery = { filters: {}, limit: null };
    mocks.createAdminClient.mockResolvedValue(
      createAdmin({
        collection: { id: 'collection-1' },
        entries: [{ id: 'entry-1' }],
        query,
      })
    );
    const { GET } = await import('./route');

    const response = await GET(
      request(
        { 'x-app-id': 'richfield', 'x-app-secret': 'secret' },
        '?limit=9999'
      ),
      params
    );

    await expect(response.json()).resolves.toEqual({
      submissions: [{ id: 'entry-1' }],
    });
    expect(query.filters['profile_data->>emailNotificationStatus']).toBe(
      'pending'
    );
    expect(query.filters.ws_id).toBe(WS);
    expect(query.filters.collection_id).toBe('collection-1');
    expect(query.limit).toBe(200);
  });

  it('refuses an app that is not the workspace binding owner', async () => {
    mocks.createAdminClient.mockResolvedValue({});
    mocks.resolveWorkspaceExternalProjectBinding.mockResolvedValue({
      adapter: 'yashie',
      enabled: true,
    });
    const { GET } = await import('./route');

    const response = await GET(
      request({ 'x-app-id': 'richfield', 'x-app-secret': 'secret' }),
      params
    );

    expect(response.status).toBe(403);
  });
});

describe('POST submission Turnstile gate', () => {
  const body = {
    appSecret: 'secret',
    company: 'Acme Foods',
    email: 'buyer@acme.test',
    inquiryType: 'Distribution',
    message: 'We would like to stock your range.',
    name: 'Mai Nguyen',
  };

  function postRequest(payload: Record<string, unknown>) {
    return new Request(
      `https://tuturuuu.com/api/v1/workspaces/${WS}/external-projects/submissions`,
      {
        body: JSON.stringify(payload),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }
    );
  }

  beforeEach(() => {
    mocks.createAdminClient.mockResolvedValue(
      createAdmin({
        collection: { id: 'collection-1' },
        entries: [],
        query: { filters: {}, limit: null },
      })
    );
    mocks.createWorkspaceExternalProjectEntry.mockResolvedValue({
      id: 'entry-1',
    });
  });

  it('accepts a submission when no secret is configured, without calling Cloudflare', async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    const { POST } = await import('./route');

    const response = await POST(postRequest(body), params);

    expect(response.status).toBe(201);
    expect(mocks.verifyTurnstileToken).not.toHaveBeenCalled();
  });

  it('rejects a submission with no token once a secret is configured', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'secret-key';
    mocks.verifyTurnstileToken.mockRejectedValue(
      new FakeTurnstileError('required')
    );
    const { POST } = await import('./route');

    const response = await POST(postRequest(body), params);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'required' });
    // Nothing is written when the challenge fails.
    expect(mocks.createWorkspaceExternalProjectEntry).not.toHaveBeenCalled();
    delete process.env.TURNSTILE_SECRET_KEY;
  });

  it('saves the submission when the token verifies', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'secret-key';
    mocks.verifyTurnstileToken.mockResolvedValue(undefined);
    const { POST } = await import('./route');

    const response = await POST(
      postRequest({ ...body, turnstileToken: 'token-abc' }),
      params
    );

    expect(response.status).toBe(201);
    expect(mocks.verifyTurnstileToken).toHaveBeenCalledWith(
      expect.anything(),
      'token-abc'
    );
    expect(mocks.createWorkspaceExternalProjectEntry).toHaveBeenCalled();
    delete process.env.TURNSTILE_SECRET_KEY;
  });
});

describe('GET binding ownership', () => {
  it('refuses an app that is not the workspace binding owner', async () => {
    mocks.createAdminClient.mockResolvedValue({});
    mocks.resolveWorkspaceExternalProjectBinding.mockResolvedValue({
      adapter: 'yashie',
      enabled: true,
    });
    const { GET } = await import('./route');

    const response = await GET(
      request({ 'x-app-id': 'richfield', 'x-app-secret': 'secret' }),
      params
    );

    expect(response.status).toBe(403);
  });
});
