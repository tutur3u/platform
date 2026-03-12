import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@tuturuuu/types';
import type { TypedSupabaseClient } from '../types';
import {
  createBaseBrowserClient,
  createBaseClientWithSession,
  createBaseDynamicBrowserClient,
} from './browser-base';
import { applyClientSession } from './session-switch';

const WARNING_KEY = '__tuturuuu_supabase_client_deprecation_warning__';

function isTruthyFlag(value?: string) {
  return value === '1' || value === 'true';
}

function isFalsyFlag(value?: string) {
  return value === '0' || value === 'false';
}

function resolveFlag(...values: Array<string | undefined>) {
  if (values.some((value) => isTruthyFlag(value))) {
    return true;
  }

  if (values.some((value) => isFalsyFlag(value))) {
    return false;
  }

  return undefined;
}

function shouldForceBypass() {
  return (
    resolveFlag(
      process.env.NEXT_PUBLIC_SUPABASE_CLIENT_FORCE_BYPASS,
      process.env.SUPABASE_CLIENT_FORCE_BYPASS
    ) ?? true
  );
}

function shouldThrowDeprecationError() {
  return (
    resolveFlag(
      process.env.SUPABASE_CLIENT_STRICT_MODE,
      process.env.NEXT_PUBLIC_SUPABASE_CLIENT_STRICT_MODE
    ) === true || !shouldForceBypass()
  );
}

function warnOnce() {
  if (process.env.NODE_ENV === 'production' && process.env.VITEST !== 'true') {
    return;
  }

  if ((globalThis as Record<string, unknown>)[WARNING_KEY]) {
    return;
  }

  (globalThis as Record<string, unknown>)[WARNING_KEY] = true;

  console.warn(
    '[@tuturuuu/supabase] `next/client` is deprecated for CRUD/storage access. ' +
      'Use @tuturuuu/internal-api for data access and prefer ' +
      '`@tuturuuu/supabase/next/auth-browser` or `@tuturuuu/supabase/next/realtime-browser` ' +
      'for temporary browser exceptions.'
  );
}

function assertDeprecatedBrowserClientAllowed() {
  if (shouldThrowDeprecationError()) {
    throw new Error(
      'Deprecated Supabase browser client access is disabled. ' +
        'Set SUPABASE_CLIENT_FORCE_BYPASS=true only for temporary compatibility, ' +
        'or migrate to @tuturuuu/internal-api / explicit auth-browser and realtime-browser modules.'
    );
  }

  warnOnce();
}

// Using SupabaseClient<any> to allow dynamic client creation without schema constraints.
// This is intentional for cases where the database schema type is determined at runtime.
/**
 * @deprecated Use `@tuturuuu/internal-api` for CRUD/storage, or
 * `@tuturuuu/supabase/next/realtime-browser` for temporary realtime exceptions.
 */
export function createDynamicClient(): SupabaseClient<any> {
  assertDeprecatedBrowserClientAllowed();
  return createBaseDynamicBrowserClient();
}

/**
 * @deprecated Use `@tuturuuu/internal-api` for CRUD/storage, or
 * `@tuturuuu/supabase/next/auth-browser` for temporary auth exceptions.
 */
export function createClient<T = Database>(): SupabaseClient<T> {
  assertDeprecatedBrowserClientAllowed();
  return createBaseBrowserClient<T>();
}

/**
 * Create a Supabase client with an injected session
 * Used for multi-account support
 */
export async function createClientWithSession<T = Database>(
  session: Session
): Promise<SupabaseClient<T>> {
  assertDeprecatedBrowserClientAllowed();
  return createBaseClientWithSession<T>(session);
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
  assertDeprecatedBrowserClientAllowed();
  return applyClientSession(client, session);
}

export function __resetSupabaseClientDeprecationWarningForTests() {
  delete (globalThis as Record<string, unknown>)[WARNING_KEY];
}

export type { SupabaseClient, TypedSupabaseClient };
