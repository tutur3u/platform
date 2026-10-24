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
  it.each([
    '/api/v1/native-integrity/challenge',
    '/api/v1/native-integrity/enroll',
  ])(
    'registers exact native proof POST %s without widening other methods or suffixes',
    (path) => {
      expect(calendarPreferenceGuardOptions(request(path, 'POST'))).toEqual({
        prefixBase: 'proxy:web:native-integrity',
        routePolicies: [],
        useVerifiedBearerActor: true,
        diagnosticPolicyName: 'native-integrity-challenge',
      });
      expect(calendarPreferenceGuardOptions(request(path, 'GET'))).toEqual({
        prefixBase: 'proxy:web:api',
      });
      expect(
        calendarPreferenceGuardOptions(request(`${path}/extra`, 'POST'))
      ).toEqual({ prefixBase: 'proxy:web:api' });
      const denial = new Response('{}', {
        status: 429,
        headers: { 'X-RateLimit-Policy': 'native-integrity-challenge' },
      });
      const staffOverride = vi.fn(() => new Response(null, { status: 200 }));
      expect(
        handleCalendarPreferenceGuardResponse(
          request(path, 'POST'),
          denial,
          staffOverride
        )
      ).toBe(denial);
      expect(staffOverride).not.toHaveBeenCalled();
    }
  );
  it('gives only exact bridge GETs an explicit bounded read policy and retains staff rejection', () => {
    const bridge = request('/native-integrity/turnstile');
    const options = calendarPreferenceGuardOptions(bridge);
    expect(options.routePolicies).toHaveLength(1);
    const policy = options.routePolicies?.[0];
    expect(policy?.key).toBe('native-integrity-bridge');
    expect(policy?.rateLimits).toEqual({
      get: [
        { window: 'minute', duration: '1 m', limit: 60 },
        { window: 'hour', duration: '1 h', limit: 240 },
        { window: 'day', duration: '1 d', limit: 1200 },
      ],
      mutate: [],
    });
    expect(
      calendarPreferenceGuardOptions(
        request('/native-integrity/turnstile', 'POST')
      )
    ).toEqual({ prefixBase: 'proxy:web:api' });
    expect(
      calendarPreferenceGuardOptions(
        request('/native-integrity/turnstile/extra')
      )
    ).toEqual({ prefixBase: 'proxy:web:api' });
    const denied = new Response('{}', { status: 429 });
    const staffOverride = vi.fn(() => new Response(null, { status: 200 }));
    expect(
      handleCalendarPreferenceGuardResponse(bridge, denied, staffOverride)
    ).toBe(denied);
    expect(staffOverride).not.toHaveBeenCalled();
  });
});
