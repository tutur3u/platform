import { validateApiKeyHash } from '@tuturuuu/auth/api-keys';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { extractSepayEndpointTokenPrefix } from '@/lib/sepay';

type SepayAdminClient = TypedSupabaseClient;

type ResolvedEndpoint = {
  id: string;
  sepay_webhook_id: string | null;
  token_hash: string;
  wallet_id: string | null;
  ws_id: string;
};

export async function resolveEndpointByToken(input: {
  sbAdmin: SepayAdminClient;
  token: string;
}) {
  const prefix = extractSepayEndpointTokenPrefix(input.token);
  if (!prefix) {
    return { endpoint: null, error: null };
  }

  const { data, error } = await input.sbAdmin
    .from('sepay_webhook_endpoints')
    .select('id, ws_id, wallet_id, token_hash, sepay_webhook_id')
    .eq('token_prefix', prefix)
    .eq('active', true)
    .is('deleted_at', null);

  if (error) {
    return { endpoint: null, error };
  }

  for (const row of (data ?? []) as ResolvedEndpoint[]) {
    const isValid = await validateApiKeyHash(input.token, row.token_hash);
    if (isValid) {
      return { endpoint: row, error: null };
    }
  }

  return { endpoint: null, error: null };
}
