import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  from: vi.fn(),
  limit: vi.fn(),
  or: vi.fn(),
}));

vi.mock('@/lib/session-api', () => ({
  authorizeAiStudioWorkspaceRequest: mocks.authorize,
}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(),
}));

import { NextRequest } from 'next/server';
import { GET } from './route';

const context = (
  resource: string,
  wsId = 'workspace-alias'
): {
  params: Promise<{ resource: string; wsId: string }>;
} => ({ params: Promise.resolve({ resource, wsId }) });

describe('AI Studio catalog API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const chain = {
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      limit: mocks.limit,
      or: mocks.or,
      order: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
    };
    mocks.or.mockReturnValue(chain);
    mocks.from.mockReturnValue(chain);
    mocks.authorize.mockResolvedValue({
      ok: true,
      sbAdmin: {
        schema: vi.fn().mockReturnValue({ from: mocks.from }),
      },
      workspace: { id: 'workspace-1' },
    });
  });

  it('returns a deterministic workspace-scoped page and cursor', async () => {
    mocks.limit.mockResolvedValue({
      data: [
        {
          description: 'First prompt',
          id: '0b9bd97c-2a2e-447e-8446-4b05495968d2',
          latest_version: 3,
          name: 'First',
          slug: 'first',
          updated_at: '2026-07-29T01:00:00.000Z',
        },
        {
          description: null,
          id: '1b9bd97c-2a2e-447e-8446-4b05495968d2',
          latest_version: 1,
          name: 'Second',
          slug: 'second',
          updated_at: '2026-07-28T01:00:00.000Z',
        },
      ],
      error: null,
    });

    const response = await GET(
      new NextRequest('https://ai.example/catalog/prompts?limit=1'),
      context('prompts')
    );

    expect(response.status).toBe(200);
    expect(mocks.authorize).toHaveBeenCalledWith(
      'workspace-alias',
      'use_ai_studio'
    );
    expect(mocks.from).toHaveBeenCalledWith('ai_studio_prompts');
    expect(mocks.limit).toHaveBeenCalledWith(2);
    await expect(response.json()).resolves.toEqual({
      items: [
        {
          description: 'First prompt',
          id: '0b9bd97c-2a2e-447e-8446-4b05495968d2',
          name: 'First',
          slug: 'first',
          updatedAt: '2026-07-29T01:00:00.000Z',
          version: 3,
        },
      ],
      nextCursor:
        '2026-07-29T01:00:00.000Z~0b9bd97c-2a2e-447e-8446-4b05495968d2',
    });
  });

  it('applies a valid cursor and rejects malformed cursors', async () => {
    mocks.limit.mockResolvedValue({ data: [], error: null });
    const cursor =
      '2026-07-29T01:00:00.000Z~0b9bd97c-2a2e-447e-8446-4b05495968d2';

    const validResponse = await GET(
      new NextRequest(
        `https://ai.example/catalog/datasets?cursor=${encodeURIComponent(cursor)}`
      ),
      context('datasets')
    );
    const invalidResponse = await GET(
      new NextRequest('https://ai.example/catalog/datasets?cursor=broken'),
      context('datasets')
    );

    expect(validResponse.status).toBe(200);
    expect(mocks.or).toHaveBeenCalledWith(
      expect.stringContaining('updated_at.lt.2026-07-29T01:00:00.000Z')
    );
    expect(invalidResponse.status).toBe(400);
  });

  it('returns 404 for unsupported catalog resources', async () => {
    const response = await GET(
      new NextRequest('https://ai.example/catalog/secrets'),
      context('secrets')
    );

    expect(response.status).toBe(404);
    expect(mocks.authorize).not.toHaveBeenCalled();
  });
});
