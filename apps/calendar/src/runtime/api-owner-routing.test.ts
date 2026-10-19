import { describe, expect, it } from 'vitest';
import { createTaskApiRewrites } from '../lib/task-api-rewrites';
import { beforeLocalApiOwner, forwardToOwner } from './api-owner-routing';

describe('Calendar native owner routing', () => {
  it('routes every Tasks rewrite before Calendar local handlers', () => {
    for (const { source } of createTaskApiRewrites('https://tasks.test')) {
      const path = source
        .replace(':wsId', 'workspace')
        .replace(':path*', 'nested/action');
      expect(beforeLocalApiOwner(path)).toBe('tasks');
    }
  });
  it.each([
    ['/api/workspaces/invitations', 'web'],
    ['/api/v1/workspaces/ws/settings/permissions', 'web'],
    ['/api/v1/workspaces/ws/users/feedbacks', 'web'],
    ['/api/v1/workspaces/ws/calendar/events', null],
    ['/api/v1/workspaces/ws/calendar-settings', null],
    ['/api/v1/workspaces/ws/tasksmith', null],
    ['/api/v1/users/calendar-settings', null],
    ['/api/auth/verify-app-token', null],
    ['/api/v1/shared/tasks-extra', null],
    ['/api/cron/calendar/provider-sync', null],
  ])('keeps the owner boundary for %s', (path, expected) => {
    expect(beforeLocalApiOwner(path)).toBe(expected);
  });
  it('forwards a mutation without changing raw query, body or cookies', async () => {
    const input = new Request(
      'https://calendar.test/api/v1/workspaces/ws/tasks?cursor=a%2Bb&x=1&x=2',
      {
        method: 'PATCH',
        body: '{"revision":7}',
        headers: {
          cookie: 'app=one; refresh=two',
          'content-type': 'application/json',
        },
      }
    );
    const forwarded = forwardToOwner(input, 'https://tasks.test');
    expect(forwarded.url).toBe(
      'https://tasks.test/api/v1/workspaces/ws/tasks?cursor=a%2Bb&x=1&x=2'
    );
    expect(forwarded.method).toBe('PATCH');
    expect(await forwarded.text()).toBe('{"revision":7}');
    expect(forwarded.headers.get('cookie')).toBe('app=one; refresh=two');
    expect(forwarded.redirect).toBe('manual');
    expect(forwarded.headers.get('x-forwarded-host')).toBe('calendar.test');
  });
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'transfers %s streaming bytes once with the original abort signal',
    async (method) => {
      const failure = new Error('request stream failed');
      const controller = new AbortController();
      const body = new ReadableStream<Uint8Array>({
        start(stream) {
          stream.enqueue(new TextEncoder().encode('raw=one&raw=two'));
          stream.close();
        },
      });
      const init = {
        method,
        body,
        signal: controller.signal,
        duplex: 'half',
        headers: {
          cookie: 'app=one',
          'content-type': 'application/octet-stream',
        },
      } satisfies RequestInit & { duplex: 'half' };
      const input = new Request(
        'https://calendar.test/api/v1/workspaces/ws/tasks?x=%2B&x=2',
        init
      );
      const forwarded = forwardToOwner(input, 'https://tasks.test');
      expect(forwarded.method).toBe(method);
      expect(forwarded.url).toBe(
        'https://tasks.test/api/v1/workspaces/ws/tasks?x=%2B&x=2'
      );
      expect(forwarded.headers.get('cookie')).toBe('app=one');
      expect(await forwarded.text()).toBe('raw=one&raw=two');
      await expect(forwarded.text()).rejects.toThrow();
      controller.abort(failure);
      expect(forwarded.signal.aborted).toBe(true);
      expect(forwarded.signal.reason).toBe(failure);
    }
  );
  it('does not convert a failing body stream into an empty mutation', async () => {
    const failure = new Error('unreadable original body');
    const body = new ReadableStream<Uint8Array>({
      start(stream) {
        stream.error(failure);
      },
    });
    const init = {
      method: 'PATCH',
      body,
      duplex: 'half',
    } satisfies RequestInit & { duplex: 'half' };
    const forwarded = forwardToOwner(
      new Request('https://calendar.test/api/v1/workspaces/ws/tasks', init),
      'https://tasks.test'
    );
    await expect(forwarded.text()).rejects.toBe(failure);
  });
});
