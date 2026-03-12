import { createBrowserClient } from '@supabase/ssr';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@tuturuuu/types';
import { checkEnvVariables } from './common';

const { url, key } = checkEnvVariables({ useSecretKey: false });

export function createBaseBrowserClient<T = Database>(): SupabaseClient<T> {
  return createBrowserClient<T>(url, key);
}

export function createBaseDynamicBrowserClient(): SupabaseClient<any> {
  return createBrowserClient(url, key);
}

export async function createBaseClientWithSession<T = Database>(
  session: Session
): Promise<SupabaseClient<T>> {
  const client = createBaseBrowserClient<T>();

  const { data, error } = await client.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });

  if (error || !data.session) {
    throw new Error(
      `Failed to set session: ${error?.message || 'No session returned'}`
    );
  }

  return client;
}
