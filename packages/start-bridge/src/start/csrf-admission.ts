import {
  type CsrfExemption,
  type CsrfMode,
  checkCsrf,
  createCsrfReportLimiter,
} from '@tuturuuu/auth/csrf';

const shouldReport = createCsrfReportLimiter();

export interface BridgeCsrfOptions<Env> {
  /** Resolved by the app from its own bindings; `off` admits everything. */
  mode: (env: Env) => CsrfMode;
  /** App-relative paths that authenticate cross-site mutations themselves. */
  exemptions?: readonly CsrfExemption[];
}

/**
 * Same-origin admission for a cookie-authenticated mutation on a mounted
 * (apex) request, decided before the app's `proxy.ts` runs. Returns the
 * refusal response, or `null` to continue.
 */
export function admitMountedMutation({
  appPath,
  exemptions,
  mode,
  request,
}: {
  appPath: string;
  exemptions?: readonly CsrfExemption[];
  mode: CsrfMode;
  request: Request;
}): Response | null {
  if (mode === 'off') return null;

  const verdict = checkCsrf({
    allowedOrigins: [new URL(request.url).origin],
    exemptions,
    headers: request.headers,
    method: request.method,
    pathname: appPath,
  });
  if (verdict.ok) return null;

  if (shouldReport(`${appPath}|${verdict.reason}|${verdict.origin}`)) {
    console.warn('CSRF check failed', {
      method: request.method,
      mode,
      mounted: true,
      origin: verdict.origin,
      reason: verdict.reason,
      route: appPath,
      secFetchSite: verdict.secFetchSite,
    });
  }

  if (mode === 'report') return null;

  return Response.json(
    { code: 'CSRF_REJECTED', error: 'Cross-origin request rejected' },
    { headers: { 'Cache-Control': 'no-store' }, status: 403 }
  );
}
