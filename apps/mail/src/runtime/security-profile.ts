import {
  type AppSecurityProfile,
  applyDocumentSecurityHeaders,
  DEFAULT_PERMISSIONS,
  originSources,
} from '@tuturuuu/utils/security-headers';

/**
 * Mail document headers: no media features, report-only CSP. Email HTML
 * renders in sandboxed `srcdoc` frames, which inherit this policy.
 */
export function applyMailDocumentHeaders(
  request: Request,
  response: Response,
  env: object
) {
  const vars = env as Record<string, unknown>;
  const supabase =
    vars.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const profile: AppSecurityProfile = {
    basePath: '/mail',
    connect: originSources(supabase, true),
    img: [...originSources(supabase), 'https:'],
    permissions: DEFAULT_PERMISSIONS,
  };
  const sharedOrigin =
    vars.NEXT_PUBLIC_WEB_APP_URL ?? process.env.NEXT_PUBLIC_WEB_APP_URL;
  const reportUri = vars.TTR_CSP_REPORT_URI ?? process.env.TTR_CSP_REPORT_URI;
  return applyDocumentSecurityHeaders(response, profile, {
    requestOrigin: new URL(request.url).origin,
    sharedOrigin:
      typeof sharedOrigin === 'string' ? sharedOrigin : 'https://tuturuuu.com',
    reportUri: typeof reportUri === 'string' ? reportUri : undefined,
  });
}
