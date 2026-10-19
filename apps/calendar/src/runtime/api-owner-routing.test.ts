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
});
