/**
 * Habits feature-flag gate for the migrated `/$locale/$wsId/habits` route.
 *
 * The legacy page gates rendering on the `ENABLE_HABITS` workspace secret via
 * `verifySecret({ forceAdmin: true })`. That helper builds a Supabase admin
 * client through `createGenericClient`, which eagerly `await cookies()` from
 * `next/headers` — unavailable in the TanStack Start server runtime, so it
 * throws here. Instead we read `workspace_secrets` over PostgREST with the
 * service key inside a `createServerFn` handler, mirroring the service-role
 * read pattern already used by the public document route. The handler only
 * runs server-side, so the service key never reaches the client bundle.
 *
 * Fail-closed: any missing env, fetch error, or non-matching row resolves to
 * `false` (habits disabled -> `notFound()` in the loader).
 */

import { createServerFn } from '@tanstack/react-start';

export const HABITS_ENABLED_SECRET = 'ENABLE_HABITS';

function getServerEnvValue(name: string) {
  if (typeof process === 'undefined') {
    return undefined;
  }

  const value = process.env[name]?.trim();
  return value || undefined;
}

function getSupabaseRestUrl(table: string) {
  const rawUrl =
    getServerEnvValue('SUPABASE_SERVER_URL') ??
    getServerEnvValue('SUPABASE_URL') ??
    getServerEnvValue('NEXT_PUBLIC_SUPABASE_URL');

  if (!rawUrl) {
    return null;
  }

  try {
    return new URL(`/rest/v1/${table}`, rawUrl);
  } catch {
    return null;
  }
}

function getSupabaseServiceKey() {
  return (
    getServerEnvValue('SUPABASE_SECRET_KEY') ??
    getServerEnvValue('SUPABASE_SERVICE_ROLE_KEY')
  );
}

/**
 * Service-role read of `workspace_secrets`: resolves `true` only when an
 * `ENABLE_HABITS=true` row exists for the resolved workspace id. Fail-closed on
 * any error. Expects a concrete workspace id (callers resolve `personal` and
 * other aliases before invoking this).
 */
export const isHabitsEnabled = createServerFn({ method: 'GET' })
  .validator((data: { workspaceId: string }) => data)
  .handler(async ({ data }): Promise<boolean> => {
    const restUrl = getSupabaseRestUrl('workspace_secrets');
    const serviceKey = getSupabaseServiceKey();

    if (!restUrl || !serviceKey) {
      return false;
    }

    restUrl.searchParams.set('select', 'value');
    restUrl.searchParams.set('ws_id', `eq.${data.workspaceId}`);
    restUrl.searchParams.set('name', `eq.${HABITS_ENABLED_SECRET}`);
    restUrl.searchParams.set('value', 'eq.true');
    restUrl.searchParams.set('limit', '1');

    try {
      const response = await fetch(restUrl, {
        cache: 'no-store',
        headers: {
          apikey: serviceKey,
          authorization: `Bearer ${serviceKey}`,
        },
      });

      if (!response.ok) {
        return false;
      }

      const payload: unknown = await response.json();
      return Array.isArray(payload) && payload.length > 0;
    } catch {
      return false;
    }
  });
