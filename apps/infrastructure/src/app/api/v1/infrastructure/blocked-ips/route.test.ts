import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  connection: vi.fn(),
  from: vi.fn(),
  getUpstashRestRedisClient: vi.fn(),
  redisSet: vi.fn(),
  unblockIP: vi.fn(),
}));

vi.mock('@/lib/infrastructure-admin-access', () => ({
  authorizeInfrastructureAdminRequest: (...args: unknown[]) =>
    mocks.authorize(...args),
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: (...args: unknown[]) => mocks.connection(...args),
}));

vi.mock('@tuturuuu/utils/abuse-protection', () => ({
  BLOCK_DURATIONS: {
    1: 300,
    2: 900,
    3: 3600,
    4: 86_400,
  },
  REDIS_KEYS: {
    IP_BLOCKED: (ipAddress: string) => `blocked:${ipAddress}`,
    IP_BLOCK_LEVEL: (ipAddress: string) => `level:${ipAddress}`,
  },
  WINDOW_MS: {
    TWENTY_FOUR_HOURS: 86_400_000,
  },
  unblockIP: (...args: unknown[]) => mocks.unblockIP(...args),
}));

vi.mock('@tuturuuu/utils/upstash-rest', () => ({
  getUpstashRestRedisClient: (...args: unknown[]) =>
    mocks.getUpstashRestRedisClient(...args),
}));

import { DELETE, GET, POST } from './route';

const USER_ID = '42529372-c669-4833-bb32-2cab1f4ffd83';

function createRequest(method: string, body?: unknown, query = '') {
  return new Request(
    `https://infrastructure.example/api/v1/infrastructure/blocked-ips${query}`,
    {
      body: body === undefined ? undefined : JSON.stringify(body),
      method,
    }
  );
}

function authorize() {
  mocks.authorize.mockResolvedValue({
    ok: true,
    sbAdmin: { from: mocks.from },
    user: { id: USER_ID },
  });
}

function deny(status: 401 | 403) {
  mocks.authorize.mockResolvedValue({
    ok: false,
    response: Response.json(
      { error: status === 401 ? 'Unauthorized' : 'Forbidden' },
      { status }
    ),
  });
}

type GetQueryResult = {
  count: number | null;
  data: Array<{ id: string }> | null;
  error: { message: string } | null;
};

function mockGetQuery(
  result: GetQueryResult = {
    count: 1,
    data: [{ id: 'block-1' }],
    error: null,
  }
) {
  const query = {
    eq: vi.fn(() => query),
    ilike: vi.fn(() => query),
    order: vi.fn(() => query),
    range: vi.fn(() => Promise.resolve(result)),
    select: vi.fn(() => query),
  };
  mocks.from.mockReturnValue(query);
  return query;
}

function mockPostQueries(options?: {
  existingBlock?: unknown;
  insertError?: unknown;
}) {
  const existingSingle = vi.fn().mockResolvedValue({
    data: options?.existingBlock ?? null,
    error: null,
  });
  const existingSecondEq = vi.fn(() => ({ single: existingSingle }));
  const existingFirstEq = vi.fn(() => ({ eq: existingSecondEq }));
  const existingSelect = vi.fn(() => ({ eq: existingFirstEq }));

  const insertedRecord = { id: 'block-1', ip_address: '203.0.113.10' };
  const insertSingle = vi.fn().mockResolvedValue({
    data: insertedRecord,
    error: options?.insertError ?? null,
  });
  const insertSelect = vi.fn(() => ({ single: insertSingle }));
  const insert = vi.fn(() => ({ select: insertSelect }));

  mocks.from.mockReturnValue({ insert, select: existingSelect });
  return { insert, insertedRecord };
}

describe('blocked IP authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUpstashRestRedisClient.mockResolvedValue({ set: mocks.redisSet });
    mocks.redisSet.mockResolvedValue('OK');
    mocks.unblockIP.mockResolvedValue(true);
  });

  for (const status of [401, 403] as const) {
    it(`denies GET with ${status} before querying the denylist`, async () => {
      deny(status);

      const response = await GET(createRequest('GET'));

      expect(response.status).toBe(status);
      expect(mocks.authorize).toHaveBeenCalledWith('view_infrastructure');
      expect(mocks.from).not.toHaveBeenCalled();
      expect(mocks.getUpstashRestRedisClient).not.toHaveBeenCalled();
    });

    it(`denies POST with ${status} before parsing or writing`, async () => {
      deny(status);

      const response = await POST(createRequest('POST', { invalid: true }));

      expect(response.status).toBe(status);
      expect(mocks.authorize).toHaveBeenCalledWith('view_infrastructure');
      expect(mocks.from).not.toHaveBeenCalled();
      expect(mocks.getUpstashRestRedisClient).not.toHaveBeenCalled();
    });

    it(`denies DELETE with ${status} before unblocking`, async () => {
      deny(status);

      const response = await DELETE(
        createRequest('DELETE', { ip_address: '203.0.113.10' })
      );

      expect(response.status).toBe(status);
      expect(mocks.authorize).toHaveBeenCalledWith('view_infrastructure');
      expect(mocks.unblockIP).not.toHaveBeenCalled();
    });
  }
});

describe('blocked IP route GET', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authorize();
  });

  it('uses the authorized admin client for filtered pagination', async () => {
    const query = mockGetQuery();

    const response = await GET(
      createRequest(
        'GET',
        undefined,
        '?status=active&page=2&pageSize=10&ip=203'
      )
    );

    expect(response.status).toBe(200);
    expect(mocks.from).toHaveBeenCalledWith('blocked_ips');
    expect(query.eq).toHaveBeenCalledWith('status', 'active');
    expect(query.ilike).toHaveBeenCalledWith('ip_address', '%203%');
    expect(query.range).toHaveBeenCalledWith(10, 19);
    await expect(response.json()).resolves.toMatchObject({
      count: 1,
      page: 2,
      pageSize: 10,
    });
  });

  it('returns a sanitized database error', async () => {
    mockGetQuery({
      count: null,
      data: null,
      error: { message: 'private detail' },
    });

    const response = await GET(createRequest('GET'));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: 'Error fetching blocked IPs',
    });
  });
});

describe('blocked IP route POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authorize();
    mocks.getUpstashRestRedisClient.mockResolvedValue({ set: mocks.redisSet });
    mocks.redisSet.mockResolvedValue('OK');
  });

  it.each([
    { blockLevel: 1, expectedSeconds: 300 },
    { blockLevel: 0, expectedSeconds: 100 * 365 * 24 * 60 * 60 },
  ])(
    'preserves block duration semantics for level $blockLevel',
    async ({ blockLevel, expectedSeconds }) => {
      const { insert, insertedRecord } = mockPostQueries();
      const now = Date.now();
      const dateNow = vi.spyOn(Date, 'now').mockReturnValue(now);

      const response = await POST(
        createRequest('POST', {
          block_level: blockLevel,
          ip_address: '203.0.113.10',
          notes: 'Confirmed abuse',
          reason: 'manual',
        })
      );

      expect(response.status).toBe(200);
      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({
          block_level: blockLevel,
          expires_at: new Date(now + expectedSeconds * 1000).toISOString(),
          metadata: {
            blocked_by: USER_ID,
            manual: true,
            notes: 'Confirmed abuse',
          },
        })
      );
      expect(mocks.redisSet).toHaveBeenCalledTimes(2);
      await expect(response.json()).resolves.toEqual({
        data: insertedRecord,
        message: 'IP blocked successfully',
      });
      dateNow.mockRestore();
    }
  );

  it('rejects malformed input without database or Redis work', async () => {
    const response = await POST(createRequest('POST', { block_level: 9 }));

    expect(response.status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.getUpstashRestRedisClient).not.toHaveBeenCalled();
  });

  it('does not insert or cache an already blocked IP', async () => {
    const { insert } = mockPostQueries({ existingBlock: { id: 'existing' } });

    const response = await POST(
      createRequest('POST', {
        block_level: 2,
        ip_address: '203.0.113.10',
        reason: 'manual',
      })
    );

    expect(response.status).toBe(409);
    expect(insert).not.toHaveBeenCalled();
    expect(mocks.getUpstashRestRedisClient).not.toHaveBeenCalled();
  });

  it('returns failure when the denylist insert fails', async () => {
    mockPostQueries({ insertError: { message: 'insert failed' } });

    const response = await POST(
      createRequest('POST', {
        block_level: 2,
        ip_address: '203.0.113.10',
        reason: 'manual',
      })
    );

    expect(response.status).toBe(500);
    expect(mocks.getUpstashRestRedisClient).not.toHaveBeenCalled();
  });

  it('keeps the database write successful when Redis is unavailable', async () => {
    mockPostQueries();
    mocks.getUpstashRestRedisClient.mockRejectedValue(new Error('redis down'));

    const response = await POST(
      createRequest('POST', {
        block_level: 2,
        ip_address: '203.0.113.10',
        reason: 'manual',
      })
    );

    expect(response.status).toBe(200);
  });
});

describe('blocked IP route DELETE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authorize();
    mocks.unblockIP.mockResolvedValue(true);
  });

  it('unblocks with the authorized app-session actor', async () => {
    const response = await DELETE(
      createRequest('DELETE', {
        ip_address: '203.0.113.10',
        reason: 'False positive',
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.unblockIP).toHaveBeenCalledWith(
      '203.0.113.10',
      USER_ID,
      'False positive'
    );
  });

  it('rejects malformed input before unblocking', async () => {
    const response = await DELETE(createRequest('DELETE', {}));

    expect(response.status).toBe(400);
    expect(mocks.unblockIP).not.toHaveBeenCalled();
  });

  it('returns failure when the unblock helper fails', async () => {
    mocks.unblockIP.mockResolvedValue(false);

    const response = await DELETE(
      createRequest('DELETE', { ip_address: '203.0.113.10' })
    );

    expect(response.status).toBe(500);
  });
});
