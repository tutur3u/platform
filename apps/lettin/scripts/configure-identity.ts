import { spawnSync } from 'node:child_process';

const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
] as const;
const optional = [
  'TUTURUUU_APP_COORDINATION_SECRET',
  'APP_COORDINATION_TOKEN_SECRET',
] as const;
const secrets: Record<string, string> = {};
for (const name of required) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing production secret: ${name}`);
  secrets[name] = value;
}
const url = new URL(secrets.NEXT_PUBLIC_SUPABASE_URL!);
if (
  url.protocol !== 'https:' ||
  /^(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\]$)/.test(
    url.hostname
  ) ||
  url.hostname.endsWith('.localhost') ||
  url.hostname === 'host.docker.internal'
) {
  throw new Error('Expected the production HTTPS Supabase endpoint');
}
for (const name of optional) {
  if (process.env[name]) secrets[name] = process.env[name];
}
// Send secrets over stdin: no temporary file, command arguments, or value logging.
const result = spawnSync(
  'bun',
  ['x', '--no-install', 'wrangler', 'secret', 'bulk'],
  {
    input: JSON.stringify(secrets),
    stdio: ['pipe', 'pipe', 'pipe'],
  }
);
if (result.error || result.status !== 0) {
  throw new Error(
    'Cloudflare identity secret upload failed; inspect account access'
  );
}
console.info('Shared identity secrets configured on tuturuuu-lettin');
