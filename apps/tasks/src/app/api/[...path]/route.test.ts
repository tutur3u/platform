import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET, sanitizeTasksApiProxyCookieHeader } from './route';

describe('Tasks API proxy', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('strips Supabase auth cookies while preserving internal app-session cookies', () => {
    expect(
      sanitizeTasksApiProxyCookieHeader(
        'tuturuuu_app_session=ttr_app_123; sb-nzamlz-auth-token=stale; sb-nzamlz-auth-token.0=chunk; theme=dark'
      )
    ).toBe('tuturuuu_app_session=ttr_app_123; theme=dark');
  });

  it('forwards API requests to Web without Supabase auth cookies or client IP headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': 'sb-nzamlz-auth-token=next; Path=/',
        },
        status: 200,
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      new NextRequest(
        'https://tasks.tuturuuu.localhost/api/v1/workspaces?x=1',
        {
          headers: {
            'CF-Connecting-IP': '192.0.2.3',
            'X-Forwarded-For': '192.0.2.2',
            'X-Real-IP': '192.0.2.1',
            cookie:
              'tuturuuu_app_session=ttr_app_123; sb-nzamlz-auth-token=stale; sidebar=hover',
          },
        }
      ),
      {
        params: Promise.resolve({ path: ['v1', 'workspaces'] }),
      }
    );

    expect(response.status).toBe(200);

    const [targetUrl, init] = fetchMock.mock.calls[0] ?? [];
    expect(new URL(String(targetUrl)).pathname).toBe('/api/v1/workspaces');
    expect(new URL(String(targetUrl)).search).toBe('?x=1');
    const forwardedHeaders = new Headers(init?.headers);
    expect(forwardedHeaders.get('cookie')).toBe(
      'tuturuuu_app_session=ttr_app_123; sidebar=hover'
    );
    expect(forwardedHeaders.get('x-real-ip')).toBeNull();
    expect(forwardedHeaders.get('x-forwarded-for')).toBeNull();
    expect(forwardedHeaders.get('cf-connecting-ip')).toBeNull();
    expect(response.headers.get('set-cookie')).toContain(
      'sb-nzamlz-auth-token=;'
    );
  });

  it.each(['.', '..', '%2e', '%2E%2e', '.%2e', '%252e%252e'])(
    'rejects the routed dot segment %s before forwarding',
    async (segment) => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const response = await GET(
        new NextRequest('https://tasks.tuturuuu.localhost/api/v1/workspaces'),
        { params: Promise.resolve({ path: ['v1', segment, 'workspaces'] }) }
      );

      expect(response.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it('emits no Supabase cookie deletions on the tuturuuu.com/tasks mount', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': 'sb-nzamlz-auth-token=next; Path=/',
        },
        status: 200,
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      new NextRequest('https://tuturuuu.com/tasks/api/v1/workspaces', {
        headers: { cookie: 'sb-nzamlz-auth-token=shared; sidebar=hover' },
        nextConfig: { basePath: '/tasks' },
      }),
      { params: Promise.resolve({ path: ['v1', 'workspaces'] }) }
    );

    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it('does not proxy task-owned user config APIs to Web', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      new NextRequest(
        'https://tasks.tuturuuu.localhost/api/v1/users/me/workspaces/ws-1/configs/TASK_DEFAULT_BOARD_ID'
      ),
      {
        params: Promise.resolve({
          path: [
            'v1',
            'users',
            'me',
            'workspaces',
            'ws-1',
            'configs',
            'TASK_DEFAULT_BOARD_ID',
          ],
        }),
      }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'Task API route is not mounted in the tasks app',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not proxy task-owned user preference APIs to Web', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(
      new NextRequest(
        'https://tasks.tuturuuu.localhost/api/v1/users/me/configs/TASK_DIALOG_DEFAULT_PRESENTATION'
      ),
      {
        params: Promise.resolve({
          path: [
            'v1',
            'users',
            'me',
            'configs',
            'TASK_DIALOG_DEFAULT_PRESENTATION',
          ],
        }),
      }
    );

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
