import { connection, NextResponse } from 'next/server';
import { resolveWorkspaceRouteAccess } from '@/lib/workspace-route-access';
import {
  NewsletterGateError,
  type NewsletterGateCode,
} from './domain';

const STATUS: Record<NewsletterGateCode, number> = {
  flag_disabled: 403,
  domain_missing: 404,
  domain_unverified: 403,
  domain_not_approved: 403,
  domain_suspended: 403,
  sender_missing: 404,
  sender_not_approved: 403,
  sender_suspended: 403,
  local_part_denied: 400,
  invalid_local_part: 400,
  recipient_not_actor: 403,
  daily_cap: 429,
  not_one_recipient: 400,
  apex_domain: 400,
  public_suffix: 400,
  platform_domain: 400,
  localhost: 400,
  ip_address: 400,
  wildcard: 400,
  invalid_subdomain: 400,
  ses_records: 422,
  invalid_message: 400,
  invalid_email: 400,
  invalid_token: 400,
  invalid_request: 400,
  mailer_unconfigured: 503,
  mailer_failed: 502,
  conflict: 409,
  delivery_state: 409,
  store_failed: 500,
  not_found: 404,
};

export function newsletterJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'cache-control': 'private, no-store' },
  });
}

export function newsletterErrorResponse(error: unknown) {
  if (error instanceof NewsletterGateError) {
    return newsletterJson({ error: error.code }, STATUS[error.code]);
  }
  console.error('[newsletter] request failed');
  return newsletterJson({ error: 'store_failed' }, 500);
}

export async function readJson(
  request: Request
): Promise<{ ok: true; value: unknown } | { ok: false; response: NextResponse }> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return {
      ok: false,
      response: newsletterJson({ error: 'invalid_request' }, 400),
    };
  }
}

export async function requireNewsletterManager(request: Request, wsId: string) {
  await connection();
  const access = await resolveWorkspaceRouteAccess(request, wsId, [
    'manage_workspace_settings',
  ]);
  if (!access.ok) return { ok: false as const, response: access.response };
  return {
    ok: true as const,
    user: access.user,
    wsId: access.permissions.wsId,
  };
}
