/**
 * @tuturuuu/supabase - Supabase client and utilities for Tuturuuu Platform
 *
 * This package provides Next.js-optimized Supabase client utilities with
 * proper SSR support, cookie handling, and TypeScript type safety.
 *
 * ## Usage
 *
 * This package uses subpath exports. Import from specific paths:
 *
 * ```typescript
 * // Client-side (browser)
 * import { createClient } from '@tuturuuu/supabase/next/client';
 *
 * // Server-side (Next.js server components, API routes)
 * import { createClient, createAdminClient } from '@tuturuuu/supabase/next/server';
 *
 * // User utilities
 * import { getUser, getCurrentUser } from '@tuturuuu/supabase/next/user';
 *
 * // Middleware proxy
 * import { updateSession } from '@tuturuuu/supabase/next/proxy';
 * ```
 *
 * @packageDocumentation
 */

export type {
  SupabaseClient,
  TypedSupabaseClient,
} from './next/client';
// Re-export types and common utilities only (no function conflicts)
export type { SupabaseCookie } from './next/common';
export { checkEnvVariables } from './next/common';
export type {
  RealtimeChannel,
  RealtimePresenceState,
} from './next/realtime';
export type {
  SupabaseSession,
  SupabaseUser,
} from './next/user';

// Note: createClient functions are NOT re-exported here to avoid conflicts.
// Use subpath imports as shown in the usage examples above.
