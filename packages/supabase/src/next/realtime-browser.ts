import { createBaseDynamicBrowserClient } from './browser-base';

export function createRealtimeClient() {
  return createBaseDynamicBrowserClient();
}

export type {
  RealtimeChannel,
  RealtimePresenceState,
} from '@supabase/supabase-js';
export type { SupabaseClient, TypedSupabaseClient } from '../types';
