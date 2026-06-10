import type { Session } from '@supabase/supabase-js';
import type { Database } from '@tuturuuu/types';
import type { SupabaseClient, TypedSupabaseClient } from '../types';
import {
  type BrowserSupabaseClientConfig,
  createBaseBrowserClient,
  createBaseClientWithSession,
} from './browser-base';
import { applyClientSession } from './session-switch';

export function createAuthClient(
  config?: BrowserSupabaseClientConfig
): TypedSupabaseClient {
  return createBaseBrowserClient(config);
}

export async function createAuthClientWithSession(
  session: Session,
  config?: BrowserSupabaseClientConfig
): Promise<SupabaseClient<Database>> {
  return createBaseClientWithSession<Database>(session, config);
}

export async function switchAuthClientSession(
  client: TypedSupabaseClient,
  session: Session
): Promise<Session> {
  return applyClientSession(client, session);
}

export type { SupabaseClient, TypedSupabaseClient } from '../types';
