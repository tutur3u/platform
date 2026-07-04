import 'server-only';

import { createAdminClient } from '@tuturuuu/supabase/next/server';

type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

export async function callMindRpc<T>(
  fn: string,
  args?: Record<string, unknown>
) {
  const sbAdmin = await createAdminClient({ noCookie: true });
  const privateClient = (
    'schema' in sbAdmin
      ? (
          sbAdmin as unknown as { schema: (schema: string) => RpcClient }
        ).schema('private')
      : sbAdmin
  ) as RpcClient;
  const { data, error } = await privateClient.rpc(fn, args);

  if (error) {
    throw new Error(error.message ?? `Mind RPC ${fn} failed`);
  }

  return data as T;
}
