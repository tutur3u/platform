import type { Session } from '@supabase/supabase-js';
import type { Database } from '@tuturuuu/types';
import type { SupabaseClient, TypedSupabaseClient } from '../types';
import {
  createBaseBrowserClient,
  createBaseClientWithSession,
} from './browser-base';

export function createAuthClient(): TypedSupabaseClient {
  return createBaseBrowserClient();
}

export async function createAuthClientWithSession(
  session: Session
): Promise<SupabaseClient<Database>> {
  return createBaseClientWithSession<Database>(session);
}

export async function switchAuthClientSession(
  client: TypedSupabaseClient,
  session: Session
): Promise<Session> {
  const { data, error } = await client.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });

  if (error || !data.session) {
    throw new Error(
      `Failed to switch session: ${error?.message || 'No session returned'}`
    );
  }

  return data.session;
}

export type { SupabaseClient, TypedSupabaseClient } from '../types';
