import { describe, expect, it, vi } from 'vitest';

const authMock = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: authMock.resolve,
}));

import {
  resolveTimedSessionUser,
  timeServerPhase,
  withServerTiming,
} from './server-timing';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function parse(header: string | null) {
  return Object.fromEntries(
    (header ?? '').split(', ').map((entry) => {
      const [name, dur] = entry.split(';dur=');
      return [name, Number(dur)];
    })
  );
}

describe('withServerTiming', () => {
  it('adds total only when no phase ran, leaving body and status intact', async () => {
    const handler = withServerTiming(
      () => new Response('{"ok":true}', { status: 201 })
    );
    const response = await handler();
    expect(response.status).toBe(201);
    expect(await response.text()).toBe('{"ok":true}');
    expect(response.headers.get('Server-Timing')).toMatch(
      /^total;dur=\d+\.\d$/
    );
  });

  it('reports auth, db and cache phases in a fixed order and sums repeats', async () => {
    const handler = withServerTiming(async () => {
      await timeServerPhase('db', () => sleep(15));
      await timeServerPhase('cache', () => sleep(5));
      await timeServerPhase('db', () => sleep(15));
      await timeServerPhase('auth', () => sleep(10));
      return new Response(null);
    });
    const header = (await handler()).headers.get('Server-Timing');
    expect(header).toMatch(
      /^auth;dur=[\d.]+, db;dur=[\d.]+, cache;dur=[\d.]+, total;dur=[\d.]+$/
    );
    const timing = parse(header);
    expect(timing.db).toBeGreaterThanOrEqual(25);
    expect(timing.total).toBeGreaterThanOrEqual(timing.db + timing.auth);
  });

  it('keeps concurrent requests isolated', async () => {
    const slow = withServerTiming(async () => {
      await timeServerPhase('db', () => sleep(30));
      return new Response(null);
    });
    const fast = withServerTiming(() => new Response(null));
    const [slowResponse, fastResponse] = await Promise.all([slow(), fast()]);
    expect(slowResponse.headers.get('Server-Timing')).toContain('db;dur=');
    expect(fastResponse.headers.get('Server-Timing')).not.toContain('db;');
  });

  it('appends to an existing Server-Timing header', async () => {
    const handler = withServerTiming(
      () => new Response(null, { headers: { 'Server-Timing': 'edge;dur=1.0' } })
    );
    const header = (await handler()).headers.get('Server-Timing');
    expect(header).toMatch(/^edge;dur=1\.0, total;dur=[\d.]+$/);
  });

  it('copies responses whose headers are immutable', async () => {
    const immutable = Response.redirect('https://example.test/', 302);
    const handler = withServerTiming(() => immutable);
    const response = await handler();
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://example.test/');
    expect(response.headers.get('Server-Timing')).toContain('total;dur=');
  });

  it('forwards handler arguments and propagates errors without a header', async () => {
    const seen = vi.fn();
    await withServerTiming((a: string, b: number) => {
      seen(a, b);
      return new Response(null);
    })('x', 2);
    expect(seen).toHaveBeenCalledWith('x', 2);
    await expect(
      withServerTiming(() => {
        throw new Error('boom');
      })()
    ).rejects.toThrow('boom');
  });

  it('never puts request data in the header', async () => {
    const handler = withServerTiming(async (_req: { user: string }) => {
      await timeServerPhase('db', () => sleep(1));
      return new Response(null);
    });
    const header = (await handler({ user: 'person@example.test' })).headers.get(
      'Server-Timing'
    );
    expect(header).toMatch(/^[a-z]+;dur=[\d.]+(, [a-z]+;dur=[\d.]+)*$/);
    expect(header).not.toContain('example');
  });
});

describe('timeServerPhase', () => {
  it('runs the callback untimed outside a timed request', async () => {
    await expect(timeServerPhase('db', () => 'value')).resolves.toBe('value');
  });

  it('still records the duration when the callback throws', async () => {
    const handler = withServerTiming(async () => {
      await timeServerPhase('db', async () => {
        await sleep(5);
        throw new Error('query failed');
      }).catch(() => undefined);
      return new Response(null);
    });
    expect((await handler()).headers.get('Server-Timing')).toContain('db;dur=');
  });
});

describe('resolveTimedSessionUser', () => {
  it('delegates to the session resolver and reports auth time', async () => {
    const resolution = { user: { id: 'u' }, authError: null };
    authMock.resolve.mockImplementation(async () => {
      await sleep(10);
      return resolution;
    });
    const supabase = {} as never;
    const handler = withServerTiming(async () => {
      expect(await resolveTimedSessionUser(supabase)).toBe(resolution);
      return new Response(null);
    });
    const header = (await handler()).headers.get('Server-Timing');
    expect(authMock.resolve).toHaveBeenCalledWith(supabase);
    expect(parse(header).auth).toBeGreaterThanOrEqual(9);
  });
});
