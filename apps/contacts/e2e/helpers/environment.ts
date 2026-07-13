const LOCAL_CONTACTS_URL = 'http://localhost:7827';
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:8001';

const SAFE_CONTACTS_ORIGINS = new Set([
  LOCAL_CONTACTS_URL,
  'http://127.0.0.1:7827',
  'https://contacts.tuturuuu.localhost',
  'https://contacts.tuturuuu.localhost:1355',
]);
const SAFE_SUPABASE_ORIGINS = new Set([
  LOCAL_SUPABASE_URL,
  'http://localhost:8001',
]);

function assertLocalOrigin(name: string, value: string, allowed: Set<string>) {
  const origin = new URL(value).origin;
  if (!allowed.has(origin)) {
    throw new Error(
      `Refusing to run Contacts E2E with non-local ${name}: ${origin}`
    );
  }
}

export function assertSafeContactsE2EEnvironment() {
  const contactsUrl = process.env.CONTACTS_E2E_BASE_URL ?? LOCAL_CONTACTS_URL;
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? LOCAL_SUPABASE_URL;

  assertLocalOrigin('Contacts URL', contactsUrl, SAFE_CONTACTS_ORIGINS);
  assertLocalOrigin('Supabase URL', supabaseUrl, SAFE_SUPABASE_ORIGINS);

  if (/supabase\.(co|in)/iu.test(supabaseUrl)) {
    throw new Error(
      `Refusing to run Contacts E2E with cloud Supabase: ${supabaseUrl}`
    );
  }

  return { contactsUrl, supabaseUrl };
}
