import 'server-only';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
export class AccountServiceError extends Error {
  constructor(
    readonly status: number,
    message = 'Account request failed'
  ) {
    super(message);
  }
}
export interface AccountPrivateTransport {
  rpc<T>(
    name: string,
    args: Record<string, unknown>
  ): Promise<{ data: T | null; error: { code?: string } | null }>;
}
export async function accountPrivateRpc<T>(
  name: string,
  args: Record<string, unknown>
): Promise<T> {
  const admin = await createAdminClient({ noCookie: true });
  const client = (
    admin as unknown as { schema(name: string): AccountPrivateTransport }
  ).schema('private');
  const result = await client.rpc<T>(name, args);
  if (result.error || result.data === null) {
    const code = result.error?.code;
    throw new AccountServiceError(
      code === '42501'
        ? 403
        : (result.data === null && !result.error) || code === 'P0002'
          ? 404
          : code === '40001' || code === '23505'
            ? 409
            : code === '22023'
              ? 400
              : code === '53300'
                ? 503
                : 500
    );
  }
  return result.data;
}
