export const DEFAULT_LOCALE = 'en';
export const HIVE_BASE_URL =
  process.env.HIVE_BASE_URL || 'https://hive.tuturuuu.localhost';

export const TEST_USER = {
  email: 'local@tuturuuu.com',
  id: '00000000-0000-0000-0000-000000000001',
} as const;

export const WEB_BASE_URL =
  process.env.WEB_BASE_URL || 'https://tuturuuu.localhost';

const LOCAL_HOSTNAMES = new Set(['127.0.0.1', '::1', 'localhost']);

function assertLocalUrl(label: string, value: string) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid local URL for Hive E2E.`);
  }

  if (
    !LOCAL_HOSTNAMES.has(url.hostname) &&
    !url.hostname.endsWith('.localhost')
  ) {
    throw new Error(
      `${label} must point to localhost for Hive E2E; refusing ${value}.`
    );
  }
}

export function assertLocalHiveE2EEnvironment() {
  assertLocalUrl('HIVE_BASE_URL', HIVE_BASE_URL);
  assertLocalUrl('WEB_BASE_URL', WEB_BASE_URL);

  for (const [name, value] of [
    ['NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL],
    ['SUPABASE_URL', process.env.SUPABASE_URL],
  ]) {
    if (typeof value === 'string' && value.includes('.supabase.co')) {
      throw new Error(
        `${name} points to Supabase Cloud; Hive E2E must use local Supabase.`
      );
    }
  }
}
