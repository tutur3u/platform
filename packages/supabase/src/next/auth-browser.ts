import type { Session } from '@supabase/supabase-js';
import type { Database } from '@tuturuuu/types';
import type { SupabaseClient, TypedSupabaseClient } from '../types';
import {
  createBaseBrowserClient,
  createBaseClientWithSession,
} from './browser-base';
import { applyClientSession } from './session-switch';

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
  return applyClientSession(client, session);
}

export type { SupabaseClient, TypedSupabaseClient } from '../types';
