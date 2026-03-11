import type { SupabaseClient } from '@tuturuuu/supabase';
import type { Database } from '@tuturuuu/types';
import { WORKSPACE_SECRET_KEYS } from './constants';
import type { RateLimitConfig } from './types';

const RATE_LIMIT_SECRET_MAPPINGS: Array<{
  configKey: keyof RateLimitConfig;
  secretName: string;
}> = [
  {
    configKey: 'workspacePerMinute',
    secretName: WORKSPACE_SECRET_KEYS.EMAIL_RATE_LIMIT_MINUTE,
  },
  {
    configKey: 'workspacePerHour',
    secretName: WORKSPACE_SECRET_KEYS.EMAIL_RATE_LIMIT_HOUR,
  },
  {
    configKey: 'workspacePerDay',
    secretName: WORKSPACE_SECRET_KEYS.EMAIL_RATE_LIMIT_DAY,
  },
  {
    configKey: 'userPerMinute',
    secretName: WORKSPACE_SECRET_KEYS.EMAIL_RATE_LIMIT_USER_MINUTE,
  },
  {
    configKey: 'userPerHour',
    secretName: WORKSPACE_SECRET_KEYS.EMAIL_RATE_LIMIT_USER_HOUR,
  },
  {
    configKey: 'recipientPerHour',
    secretName: WORKSPACE_SECRET_KEYS.EMAIL_RATE_LIMIT_RECIPIENT_HOUR,
  },
  {
    configKey: 'recipientPerDay',
    secretName: WORKSPACE_SECRET_KEYS.EMAIL_RATE_LIMIT_RECIPIENT_DAY,
  },
  {
    configKey: 'ipPerMinute',
    secretName: WORKSPACE_SECRET_KEYS.EMAIL_RATE_LIMIT_IP_MINUTE,
  },
  {
    configKey: 'ipPerHour',
    secretName: WORKSPACE_SECRET_KEYS.EMAIL_RATE_LIMIT_IP_HOUR,
  },
  {
    configKey: 'invitePerMinute',
    secretName: WORKSPACE_SECRET_KEYS.INVITE_RATE_LIMIT_MINUTE,
  },
  {
    configKey: 'invitePerHour',
    secretName: WORKSPACE_SECRET_KEYS.INVITE_RATE_LIMIT_HOUR,
  },
  {
    configKey: 'invitePerDay',
    secretName: WORKSPACE_SECRET_KEYS.INVITE_RATE_LIMIT_DAY,
  },
];

export async function getWorkspaceEmailRateLimitOverrides(
  supabase: SupabaseClient<Database>,
  wsId: string
): Promise<Partial<RateLimitConfig>> {
  const { data, error } = await supabase
    .from('workspace_secrets')
    .select('name, value')
    .eq('ws_id', wsId)
    .in(
      'name',
      RATE_LIMIT_SECRET_MAPPINGS.map(({ secretName }) => secretName)
    );

  if (error) {
    throw new Error(
      `Error fetching workspace rate limit secrets: ${error.message}`
    );
  }

  const overrides: Partial<RateLimitConfig> = {};

  for (const secret of data || []) {
    const mapping = RATE_LIMIT_SECRET_MAPPINGS.find(
      ({ secretName }) => secretName === secret.name
    );
    if (!mapping) continue;

    const parsedValue = Number(secret.value);
    if (!Number.isFinite(parsedValue) || parsedValue < 0) continue;

    overrides[mapping.configKey] = parsedValue;
  }

  return overrides;
}
