import type { GuardOptions } from '@tuturuuu/utils/api-proxy-guard';

export function calendarPreferenceGuardOptions(request: {
  method: string;
  nextUrl: { pathname: string };
}): Pick<
  GuardOptions,
  | 'prefixBase'
  | 'useVerifiedBearerActor'
  | 'diagnosticPolicyName'
  | 'routePolicies'
> {
  if (
    request.method === 'POST' &&
    /^\/api\/v1\/native-integrity\/(?:challenge|enroll)$/u.test(
      request.nextUrl.pathname
    )
  )
    return {
      prefixBase: 'proxy:web:native-integrity',
      routePolicies: [],
      useVerifiedBearerActor: true,
      diagnosticPolicyName: 'native-integrity-challenge',
    };
  const preferences =
    (request.method === 'GET' || request.method === 'PATCH') &&
    /^\/api\/v1\/(?:users\/calendar-settings|workspaces\/[a-zA-Z0-9_-]+\/calendar-settings)$/u.test(
      request.nextUrl.pathname
    );
  return preferences
    ? {
        prefixBase: 'proxy:web:calendar-preferences',
        routePolicies: [],
        useVerifiedBearerActor: true,
        diagnosticPolicyName: 'native-calendar-preferences',
      }
    : { prefixBase: 'proxy:web:api' };
}

/** Native preferences and verification retain hard limits for staff too. */
export function handleCalendarPreferenceGuardResponse<
  T,
  R extends { method: string; nextUrl: { pathname: string } },
>(
  request: R,
  response: T,
  handleGeneralResponse: (request: R, response: T) => T | Promise<T>
): T | Promise<T> {
  return calendarPreferenceGuardOptions(request).useVerifiedBearerActor
    ? response
    : handleGeneralResponse(request, response);
}
