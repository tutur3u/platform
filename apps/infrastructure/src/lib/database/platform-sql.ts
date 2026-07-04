import 'server-only';

import postgres, { type Sql } from 'postgres';

const PLATFORM_DATABASE_URL_KEYS = [
  'PLATFORM_DATABASE_URL',
  'POSTGRES_URL',
  'DATABASE_URL',
  'DIRECT_URL',
] as const;

const LOCAL_SUPABASE_DATABASE_URL =
  'postgres://postgres:postgres@127.0.0.1:8002/postgres';

let platformSql: Sql | null = null;

function getConfiguredDatabaseUrl() {
  for (const key of PLATFORM_DATABASE_URL_KEYS) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }

  return null;
}

function isLocalSupabaseUrl(value: string | undefined) {
  if (!value) return false;

  try {
    const { hostname, port } = new URL(value);
    return (
      port === '8001' && (hostname === '127.0.0.1' || hostname === 'localhost')
    );
  } catch {
    return false;
  }
}

function shouldUseLocalSupabaseDatabase() {
  if (process.env.NODE_ENV === 'production') {
    return false;
  }

  return (
    isLocalSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) ||
    isLocalSupabaseUrl(process.env.SUPABASE_URL) ||
    isLocalSupabaseUrl(process.env.SUPABASE_SERVER_URL)
  );
}

export function getPlatformDatabaseUrl() {
  const configuredUrl = getConfiguredDatabaseUrl();
  if (configuredUrl) return configuredUrl;

  if (shouldUseLocalSupabaseDatabase()) {
    return LOCAL_SUPABASE_DATABASE_URL;
  }

  throw new Error(
    `Missing private database connection URL. Set one of: ${PLATFORM_DATABASE_URL_KEYS.join(', ')}.`
  );
}

export function getPlatformSql() {
  if (!platformSql) {
    platformSql = postgres(getPlatformDatabaseUrl(), {
      connect_timeout: 3,
      idle_timeout: 20,
      max: 5,
      prepare: false,
    });
  }

  return platformSql;
}

export async function closePlatformSqlForTests() {
  if (!platformSql) return;

  const sql = platformSql;
  platformSql = null;
  await sql.end({ timeout: 1 });
}
