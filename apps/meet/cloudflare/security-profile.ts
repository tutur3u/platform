import {
  type AppSecurityProfile,
  applyDocumentSecurityHeaders,
  DEFAULT_PERMISSIONS,
  originSources,
} from '@tuturuuu/utils/security-headers';

/** Meet document headers: media features on, report-only CSP elsewhere. */
export function applyMeetDocumentHeaders(
  request: Request,
  response: Response,
  env: object
) {
  const vars = env as Record<string, unknown>;
  const profile: AppSecurityProfile = {
    basePath: '/meet',
    connect: [
      ...originSources(vars.NEXT_PUBLIC_SUPABASE_URL, true),
      ...originSources(vars.MEET_REALTIME_URL),
      'https://rtc.live.cloudflare.com',
    ],
    img: [
      ...originSources(vars.NEXT_PUBLIC_SUPABASE_URL),
      'https://tuturuuu.com',
    ],
    permissions: {
      ...DEFAULT_PERMISSIONS,
      camera: 'self',
      'display-capture': 'self',
      microphone: 'self',
    },
  };
  return applyDocumentSecurityHeaders(response, profile, {
    requestOrigin: new URL(request.url).origin,
    sharedOrigin:
      typeof vars.NEXT_PUBLIC_WEB_APP_URL === 'string'
        ? vars.NEXT_PUBLIC_WEB_APP_URL
        : 'https://tuturuuu.com',
    reportUri:
      typeof vars.TTR_CSP_REPORT_URI === 'string'
        ? vars.TTR_CSP_REPORT_URI
        : undefined,
  });
}
