import { createBrowserClient } from '@supabase/ssr';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@tuturuuu/types';
import { checkEnvVariables } from './common';

// import { getRealtimeLogLevel, realtimeLogger } from './realtime-log-provider';

const { url, key } = checkEnvVariables({ useSecretKey: false });
type TypedSupabaseClient = SupabaseClient<Database>;

// Using SupabaseClient<any> to allow dynamic client creation without schema constraints.
// This is intentional for cases where the database schema type is determined at runtime.
export function createDynamicClient(): SupabaseClient<any> {
  return createBrowserClient(url, key, {
    // realtime: {
    //   logLevel: getRealtimeLogLevel() as any,
    //   logger: realtimeLogger,
    // },
  });
}

export function createClient<T = Database>(): SupabaseClient<T> {
  return createBrowserClient<T>(url, key, {
    // realtime: {
    //   logLevel: getRealtimeLogLevel() as any,
    //   logger: realtimeLogger,
    // },
  });
}

/**
 * Create a Supabase client with an injected session
 * Used for multi-account support
 */
export async function createClientWithSession<T = Database>(
  session: Session
): Promise<SupabaseClient<T>> {
  const client = createBrowserClient<T>(url, key, {
    // realtime: {
    //   logLevel: getRealtimeLogLevel() as any,
    //   logger: realtimeLogger,
    // },
  });

  // Set the session manually
  // This will override any existing session
  await client.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });

  return client;
}

/**
 * Switch the session for an existing client
 * This replaces the current session cookie without revoking it on the server
 * The old session remains valid and can be switched back to later
 */
export async function switchClientSession(
  // Using SupabaseClient<any> because this function accepts clients with any database schema type.
  // The generic type cannot be expressed here as it comes from external callers with varied schemas.
  // This is a safe boundary for the `any` type as session operations are schema-agnostic.
  client: SupabaseClient<any>,
  session: Session
): Promise<Session> {
  // Set the session with the stored tokens
  // This replaces the cookie without revoking the old session on the server
  const { data, error } = await client.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });

  if (error || !data.session) {
    throw new Error(
      `Failed to switch session: ${error?.message || 'No session returned'}`
    );
  }

  // Return the fresh session (may have refreshed tokens)
  return data.session;
}

export type { SupabaseClient, TypedSupabaseClient };
