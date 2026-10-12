import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  JournalConflict,
  JournalUnavailable,
} from '@/lib/personal-journal/service';
import { PUT } from './[entryId]/route';
import { GET, POST } from './route';

const mock = vi.hoisted(() => ({
  authorize: vi.fn(),
  provider: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  list: vi.fn(),
}));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: vi.fn(async () => {}),
}));
vi.mock('@/lib/personal-journal/auth', async (original) => ({
  ...(await original<typeof import('@/lib/personal-journal/auth')>()),
  authorizeJournal: mock.authorize,
}));
vi.mock('@/lib/personal-journal/provider', () => ({
  getJournalStore: mock.provider,
}));
const actorId = '00000000-0000-4000-8000-000000000001',
  wsId = '00000000-0000-4000-8000-000000000002',
  id = '00000000-0000-4000-8000-000000000003';
const document = {
  title: 'Reflection',
  body: 'Original',
  occurredAt: '2026-10-12T10:00:00.000Z',
  timezone: 'UTC',
  mood: null,
  moodContext: '',
  domain: 'life',
  category: 'reflection',
};
const receipt = {
  ...document,
  id,
  actorId,
  workspaceId: wsId,
  revision: 1,
  createdAt: document.occurredAt,
  updatedAt: document.occurredAt,
};
const context = { params: Promise.resolve({ wsId, entryId: id }) };
function request(method: string, body?: string) {
  return new NextRequest('https://example.test/api/journal', { method, body });
}
beforeEach(() => {
  vi.clearAllMocks();
  mock.authorize.mockResolvedValue({
    ok: true,
    scope: { actorId, workspaceId: wsId },
  });
  mock.provider.mockReturnValue({
    create: mock.create,
    update: mock.update,
    list: mock.list,
  });
  mock.create.mockResolvedValue(receipt);
});
describe('personal journal HTTP behavior', () => {
  it('returns a scoped original receipt with private headers', async () => {
    const result = await POST(
      request('POST', JSON.stringify({ id, document })),
      context
    );
    expect(result.status).toBe(201);
    expect(await result.json()).toEqual(receipt);
    expect(result.headers.get('Vary')).toBe('Authorization, Cookie');
    expect(mock.create).toHaveBeenCalledWith(
      { actorId, workspaceId: wsId },
      { id, document }
    );
  });
  it('rejects malformed or actor-overridden input without storage', async () => {
    for (const body of ['{', JSON.stringify({ id, document, actorId })]) {
      expect((await POST(request('POST', body), context)).status).toBe(400);
    }
    expect(mock.provider).not.toHaveBeenCalled();
  });
  it('never acknowledges absent schema or turns it into empty history', async () => {
    mock.provider.mockImplementation(() => {
      throw new JournalUnavailable();
    });
    expect(
      (await POST(request('POST', JSON.stringify({ id, document })), context))
        .status
    ).toBe(503);
    const result = await GET(request('GET'), context);
    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({ error: 'Journal unavailable' });
  });
  it('returns 409 for revision conflict while preserving immutable operation input', async () => {
    mock.update.mockRejectedValue(new JournalConflict());
    const input = { document, operationId: actorId, expectedRevision: 1 };
    expect(
      (await PUT(request('PUT', JSON.stringify(input)), context)).status
    ).toBe(409);
    expect(mock.update).toHaveBeenCalledWith(
      { actorId, workspaceId: wsId },
      id,
      input
    );
  });
  it('checks fresh authority before storage on each call', async () => {
    mock.authorize.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 403 }),
    });
    expect(
      (await POST(request('POST', JSON.stringify({ id, document })), context))
        .status
    ).toBe(403);
    expect(mock.provider).not.toHaveBeenCalled();
  });
});
