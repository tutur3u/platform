import type { SupabaseClient } from '@tuturuuu/supabase';
import type { Database } from '@tuturuuu/types';

type FormsSchemaClient = SupabaseClient<Database> & {
  from: (table: string) => any;
  rpc: (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export function getPrivateFormsClient(
  supabase: SupabaseClient<Database>
): FormsSchemaClient {
  return supabase.schema('private') as unknown as FormsSchemaClient;
}

export async function runUntypedRpc<T>(
  supabase: SupabaseClient<Database>,
  fn: string,
  args: Record<string, unknown>
): Promise<T | null> {
  const rpcClient = getPrivateFormsClient(supabase) as unknown as {
    rpc: (
      name: string,
      params: Record<string, unknown>
    ) => Promise<{ data: T | null; error: { message: string } | null }>;
  };
  const { data, error } = await rpcClient.rpc(fn, args);

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
