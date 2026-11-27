const LOCAL_MAIL_URL = 'http://localhost:7820';
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:8001';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1']);

function assertLoopbackOrigin(name: string, value: string) {
  const parsed = new URL(value);
  const isLoopback =
    parsed.protocol === 'http:' && LOOPBACK_HOSTS.has(parsed.hostname);
  const isPortlessLocalhost =
    parsed.protocol === 'https:' && parsed.hostname.endsWith('.localhost');

  if (!isLoopback && !isPortlessLocalhost) {
    throw new Error(
      `Refusing to run Mail E2E with non-local ${name}: ${parsed.origin}`
    );
  }
}

export function assertSafeMailE2EEnvironment() {
  const mailUrl = process.env.MAIL_E2E_BASE_URL ?? LOCAL_MAIL_URL;
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? LOCAL_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    '';

  assertLoopbackOrigin('Mail URL', mailUrl);
  assertLoopbackOrigin('Supabase URL', supabaseUrl);

  if (/supabase\.(co|in)/iu.test(supabaseUrl)) {
    throw new Error(
      `Refusing to run Mail E2E with cloud Supabase: ${supabaseUrl}`
    );
  }

  if (!supabasePublishableKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) for Mail E2E'
    );
  }

  return { mailUrl, supabasePublishableKey, supabaseUrl };
}
