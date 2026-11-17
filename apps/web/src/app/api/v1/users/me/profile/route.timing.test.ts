import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
  createDynamicAdminClient: vi.fn(),
}));
vi.mock('next/server', async () => ({
  ...(await vi.importActual('next/server')),
  connection: vi.fn(),
}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (
      handler: (
        req: Request,
        context: { user: { id: string }; supabase: { from: typeof f.from } }
      ) => Promise<Response>
    ) =>
    (req: Request) =>
      handler(req, { user: { id: 'actor-1' }, supabase: { from: f.from } }),
}));

import { GET, HEAD } from './route';

const rows: Record<string, unknown> = {
  users: { id: 'actor-1', display_name: 'Display', created_at: 'now' },
  user_private_details: { email: 'a@example.test', full_name: 'Full' },
};

function query(table: string) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { data: rows[table], error: null };
    },
  };
  return chain;
}

const request = (method: 'GET' | 'HEAD') =>
  new NextRequest('https://example.test/api/v1/users/me/profile', { method });

describe('profile GET Server-Timing', () => {
  it('reports db and total durations without changing the body', async () => {
    f.from.mockImplementation(query);
    const response = await GET(request('GET'), undefined as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: 'actor-1',
      email: 'a@example.test',
      display_name: 'Display',
      full_name: 'Full',
    });
    const header = response.headers.get('Server-Timing') ?? '';
    expect(header).toMatch(/^db;dur=[\d.]+, total;dur=[\d.]+$/);
    expect(Number(/db;dur=([\d.]+)/.exec(header)?.[1])).toBeGreaterThanOrEqual(
      9
    );
    expect(header).not.toMatch(/actor|example/);
  });

  it('carries the header through HEAD', async () => {
    f.from.mockImplementation(query);
    const response = await HEAD(request('HEAD'), undefined as never);
    expect(response?.headers.get('Server-Timing')).toContain('total;dur=');
  });
});
