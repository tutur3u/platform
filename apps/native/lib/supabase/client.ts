import 'react-native-url-polyfill/auto';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@tuturuuu/types';

import { secureStorage } from './secure-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing Supabase environment variables. ' +
      'Please set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local'
  );
}

/**
 * Supabase client for React Native with secure token storage
 *
 * Uses device Keychain/Keystore for auth tokens instead of AsyncStorage.
 * This is the primary client for all database operations in the app.
 *
 * @example
 * ```typescript
 * import { supabase } from '@/lib/supabase/client';
 *
 * // Query data
 * const { data, error } = await supabase
 *   .from('workspaces')
 *   .select('*')
 *   .eq('id', wsId);
 *
 * // Auth operations
 * const { data: { user } } = await supabase.auth.getUser();
 * ```
 */
export const supabase = createSupabaseClient<Database>(
  supabaseUrl,
  supabaseKey,
  {
    auth: {
      storage: secureStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false, // Not needed for native apps
    },
  }
);

/**
 * Type-safe Supabase client type for dependency injection
 */
export type SupabaseClient = typeof supabase;
