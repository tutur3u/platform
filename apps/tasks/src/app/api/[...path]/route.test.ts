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

  it('forwards API requests to Web without Supabase auth cookies', async () => {
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
    expect(new Headers(init?.headers).get('cookie')).toBe(
      'tuturuuu_app_session=ttr_app_123; sidebar=hover'
    );
    expect(response.headers.get('set-cookie')).toContain(
      'sb-nzamlz-auth-token=;'
    );
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
