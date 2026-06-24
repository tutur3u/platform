import { createServerFn } from '@tanstack/react-start';

export const TOPIC_ANNOUNCEMENTS_ENABLED_SECRET = 'ENABLE_TOPIC_ANNOUNCEMENTS';

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
 * Server-only compatibility gate for the legacy topic-announcements workspace
 * secret. The route still performs user/workspace/permission checks first; this
 * only mirrors the legacy admin secret read until a Rust/internal-api feature
 * flag facade owns workspace-secret reads.
 */
export const isTopicAnnouncementsEnabled = createServerFn({ method: 'GET' })
  .validator((data: { workspaceId: string }) => data)
  .handler(async ({ data }): Promise<boolean> => {
    const restUrl = getSupabaseRestUrl('workspace_secrets');
    const serviceKey = getSupabaseServiceKey();

    if (!restUrl || !serviceKey) {
      return false;
    }

    restUrl.searchParams.set('select', 'value');
    restUrl.searchParams.set('ws_id', `eq.${data.workspaceId}`);
    restUrl.searchParams.set(
      'name',
      `eq.${TOPIC_ANNOUNCEMENTS_ENABLED_SECRET}`
    );
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
