import { describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  resolveTopicAnnouncementsAccess: vi.fn(),
}));

vi.mock('./shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./shared')>();
  return {
    ...actual,
    resolveTopicAnnouncementsAccess: mocks.resolveTopicAnnouncementsAccess,
  };
});

function createListQueryChain() {
  const chain: {
    eq: ReturnType<typeof vi.fn>;
    neq: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    range: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
  } = {
    eq: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    range: vi.fn(async () => ({ count: 0, data: [], error: null })),
    select: vi.fn(() => chain),
  };

  return chain;
}

function setupAccess() {
  const queryChain = createListQueryChain();
  const sbAdmin = {
    from: vi.fn(() => queryChain),
  };

  mocks.resolveTopicAnnouncementsAccess.mockResolvedValue({
    context: {
      normalizedWsId: 'workspace-1',
      sbAdmin,
    },
  });

  return { queryChain, sbAdmin };
}

function params() {
  return {
    params: Promise.resolve({
      wsId: 'workspace-1',
    }),
  };
}

describe('topic announcements GET route', () => {
  it('hides cancelled announcements from the default active view', async () => {
    const { queryChain } = setupAccess();

    const response = await GET(new Request('http://localhost'), params());

    expect(response.status).toBe(200);
    expect(queryChain.neq).toHaveBeenCalledWith('status', 'cancelled');
  });

  it('keeps cancelled rows available through the explicit cancelled filter', async () => {
    const { queryChain } = setupAccess();

    const response = await GET(
      new Request('http://localhost?status=cancelled'),
      params()
    );

    expect(response.status).toBe(200);
    expect(queryChain.eq).toHaveBeenCalledWith('status', 'cancelled');
    expect(queryChain.neq).not.toHaveBeenCalled();
  });
});
