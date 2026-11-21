import 'server-only';

import { createAdminClient } from '@tuturuuu/supabase/next/server';

type PrivateRpcClient = {
  schema(schema: 'private'): {
    rpc(
      fn: string,
      args?: Record<string, unknown>
    ): Promise<{ data: unknown; error: unknown }>;
  };
};

export async function callManagedCronRpc<T>(
  fn: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  const client = (await createAdminClient({
    noCookie: true,
  })) as unknown as PrivateRpcClient;
  const { data, error } = await client.schema('private').rpc(fn, args);

  if (error) {
    throw error;
  }

  return data as T;
}

export function ensureRpcArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}
