// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  calendarPreferenceGuardOptions,
  handleCalendarPreferenceGuardResponse,
} from './calendar-preference-guard';

const request = (pathname: string, method = 'GET') => ({
  method,
  nextUrl: { pathname },
});
describe('Web preference guard registration', () => {
  it.each(['GET', 'PATCH'])(
    'registers only exact preference paths for %s',
    (method) => {
      for (const path of [
        '/api/v1/users/calendar-settings',
        '/api/v1/workspaces/workspace-1/calendar-settings',
      ]) {
        expect(calendarPreferenceGuardOptions(request(path, method))).toEqual({
          prefixBase: 'proxy:web:calendar-preferences',
          routePolicies: [],
          useVerifiedBearerActor: true,
          diagnosticPolicyName: 'native-calendar-preferences',
        });
      }
      expect(
        calendarPreferenceGuardOptions(
          request('/api/v1/users/calendar-settings/extra', method)
        )
      ).toEqual({ prefixBase: 'proxy:web:api' });
    }
  );
  it('does not opt unrelated methods or paths into the dedicated budget', () => {
    expect(
      calendarPreferenceGuardOptions(
        request('/api/v1/users/calendar-settings', 'POST')
      )
    ).toEqual({ prefixBase: 'proxy:web:api' });
    expect(
      calendarPreferenceGuardOptions(
        request('/api/v1/workspaces/ws/calendar/events')
      )
    ).toEqual({ prefixBase: 'proxy:web:api' });
  });
  it.each(['rate-limit', 'ip-block'])(
    'preserves %s 429 for staff before the debug conversion',
    async (reason) => {
      const response = new Response('{}', {
        status: 429,
        headers: {
          'X-Proxy-Block-Reason': reason,
          'X-RateLimit-Policy': 'native-calendar-preferences',
          'Retry-After': '60',
        },
      });
      const staffOverride = vi.fn(() => new Response(null, { status: 200 }));
      const result = await handleCalendarPreferenceGuardResponse(
        request('/api/v1/users/calendar-settings'),
        response,
        staffOverride
      );
      expect(result).toBe(response);
      expect(result.status).toBe(429);
      expect(result.headers.get('X-RateLimit-Policy')).toBe(
        'native-calendar-preferences'
      );
      expect(result.headers.get('Retry-After')).toBe('60');
      expect(staffOverride).not.toHaveBeenCalled();
    }
  );
});
