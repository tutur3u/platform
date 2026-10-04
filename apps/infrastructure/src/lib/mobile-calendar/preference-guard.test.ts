import { describe, expect, it } from 'vitest';
import {
  calendarPreferenceBlockDiagnostic,
  calendarPreferenceGuardPrefix,
} from './preference-guard';

const path = '/api/v1/mobile-calendar/api/v1/users/calendar-settings';
const prefix = (pathname: string, method = 'GET') =>
  calendarPreferenceGuardPrefix({ method, nextUrl: { pathname } });

describe('Calendar preference gateway bucket boundary', () => {
  it.each([
    path,
    '/api/v1/mobile-calendar/api/v1/workspaces/synthetic-ws/calendar-settings',
  ])('isolates exactly the preference read %s', (pathname) =>
    expect(prefix(pathname)).toBe('proxy:infra:calendar-preferences')
  );
  it.each([
    `${path}/extra`,
    `${path}/`,
    '/api/v1/users/calendar-settings',
    '/api/v1/mobile-calendar/api/v1/calendar/connections',
    '/api/v1/mobile-calendar/api/v1/workspaces/synthetic-ws/calendar/events',
    '/api/v1/mobile-calendar/api/v1/workspaces/a/b/calendar-settings',
  ])('retains the common bucket for %s', (pathname) => {
    expect(prefix(pathname)).toBe('proxy:infra:api');
  });
  it.each(['PATCH', 'POST', 'DELETE', 'HEAD'])(
    'keeps %s on the original mutation/general guard',
    (method) => expect(prefix(path, method)).toBe('proxy:infra:api')
  );
  it('reports only fixed safe diagnostic fields', () => {
    const headers = new Headers({
      'X-Proxy-Block-Reason': 'route-rate-limit',
      'X-RateLimit-Policy': 'default',
      'X-RateLimit-Caller-Class': 'anonymous',
      'X-RateLimit-Window': 'hour',
      Authorization: 'Bearer private',
      'Set-Cookie': 'session=private',
    });
    expect(calendarPreferenceBlockDiagnostic(headers)).toEqual({
      reason: 'route-rate-limit',
      policy: 'default',
      callerClass: 'anonymous',
      window: 'hour',
    });
    headers.set('X-RateLimit-Policy', 'unsafe value');
    expect(calendarPreferenceBlockDiagnostic(headers).policy).toBe('unknown');
  });
});
