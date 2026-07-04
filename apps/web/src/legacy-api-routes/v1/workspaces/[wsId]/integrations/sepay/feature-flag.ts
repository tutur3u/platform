import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

const SEPAY_FEATURE_FLAG_SECRET = 'ENABLE_SEPAY_INTEGRATION';

function isTruthySecret(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return (
    normalized === '1' ||
    normalized === 'true' ||
    normalized === 'yes' ||
    normalized === 'on'
  );
}

export async function isSepayIntegrationEnabled(input: {
  sbAdmin: TypedSupabaseClient;
  wsId: string;
}) {
  const { data, error } = await input.sbAdmin
    .from('workspace_secrets')
    .select('value')
    .eq('ws_id', input.wsId)
    .eq('name', SEPAY_FEATURE_FLAG_SECRET)
    .maybeSingle();

  if (error) {
    throw new Error('Failed to resolve SePay integration feature flag');
  }

  return isTruthySecret(data?.value);
}
