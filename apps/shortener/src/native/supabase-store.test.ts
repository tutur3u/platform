// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseLinkStore } from './supabase-store.server';

const env = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.invalid',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
  SUPABASE_SECRET_KEY: 'sb_secret_fixture',
};

describe('Supabase link store', () => {
  beforeEach(() => {
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('looks up the exact slug with a single-row service-role read', async () => {
    const requests: Request[] = [];
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        requests.push(request);
        return Response.json({
          id: 'l1',
          link: 'https://example.com',
          password_hash: null,
          password_hint: null,
        });
      }
    );
    const store = createSupabaseLinkStore(fetcher as unknown as typeof fetch);
    expect(await store.findBySlug('My-Alias_1')).toMatchObject({ id: 'l1' });
    const url = new URL(requests[0]!.url);
    expect(url.origin).toBe(env.NEXT_PUBLIC_SUPABASE_URL);
    expect(url.pathname).toBe('/rest/v1/shortened_links');
    expect(url.searchParams.get('slug')).toBe('eq.My-Alias_1');
    expect(url.searchParams.get('select')).toBe(
      'id,link,password_hash,password_hint'
    );
    expect(requests[0]!.headers.get('accept')).toBe(
      'application/vnd.pgrst.object+json'
    );
    expect(requests[0]!.headers.get('apikey')).toBe(env.SUPABASE_SECRET_KEY);
  });

  it('treats missing or failed rows as not found and inserts clicks', async () => {
    const bodies: string[] = [];
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        if (request.method === 'POST') {
          bodies.push(await request.text());
          return new Response(null, { status: 201 });
        }
        return Response.json(
          { code: 'PGRST116', message: 'no rows' },
          { status: 406 }
        );
      }
    );
    const store = createSupabaseLinkStore(fetcher as unknown as typeof fetch);
    expect(await store.findBySlug('missing')).toBeNull();
    expect(await store.findById('missing')).toBeNull();
    await store.recordClick({
      link_id: 'l1',
      ip_address: null,
      user_agent: null,
      referrer: null,
      country: 'VN',
      country_region: null,
      city: null,
      latitude: null,
      longitude: null,
      timezone: null,
      postal_code: null,
      vercel_region: null,
      vercel_id: null,
    });
    expect(JSON.parse(bodies[0]!)).toMatchObject({
      link_id: 'l1',
      country: 'VN',
    });
  });
});
