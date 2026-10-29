// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ or: vi.fn() }));

function createQuery() {
  const query: Record<string, any> = {
    eq: vi.fn(() => query),
    limit: vi.fn(async () => ({ data: [], error: null })),
    or: mocks.or.mockImplementation(() => query),
    order: vi.fn(() => query),
    select: vi.fn(() => query),
  };
  return query;
}

vi.mock('../shared', () => ({
  normalizeEmail: (value: string) => value,
  resolveTopicAnnouncementsAccess: vi.fn(async () => ({
    context: {
      normalizedWsId: 'ws-1',
      sbAdmin: { from: () => createQuery() },
    },
  })),
  serializeTopicAnnouncementContacts: vi.fn(async () => []),
  TopicAnnouncementContactSchema: {},
  validateTopicAnnouncementWorkspaceUserId: vi.fn(),
}));

const { GET } = await import('./route');

function search(q: string) {
  return GET(
    new Request(
      `http://localhost/topic-announcements/contacts?q=${encodeURIComponent(q)}`
    ),
    { params: Promise.resolve({ wsId: 'ws-1' }) }
  );
}

beforeEach(() => mocks.or.mockClear());

describe('topic announcement contact search', () => {
  it('searches name and email with one quoted operand each', async () => {
    await search('ann');

    expect(mocks.or).toHaveBeenCalledWith(
      'name.ilike."%ann%",email.ilike."%ann%"'
    );
  });

  it.each([
    'a%,archived.eq.true',
    'x)',
    'a"b',
    'a,b',
    '"),archived.eq.true,("',
  ])('keeps injected input %j inside the quoted operands', async (q) => {
    await search(q);

    expect(mocks.or).toHaveBeenCalledOnce();
    const filter = mocks.or.mock.calls[0]?.[0] as string;
    // Without the quoted operands only the two intended filters remain.
    expect(filter.replace(/"(?:[^"\\]|\\.)*"/g, '')).toBe(
      'name.ilike.,email.ilike.'
    );
  });

  it('escapes LIKE wildcards so they match literally', async () => {
    await search('a%,archived.eq.true');

    expect(mocks.or).toHaveBeenCalledWith(
      'name.ilike."%a\\\\%,archived.eq.true%",email.ilike."%a\\\\%,archived.eq.true%"'
    );
  });

  it('does not filter when there is no search term', async () => {
    await search('   ');

    expect(mocks.or).not.toHaveBeenCalled();
  });
});
