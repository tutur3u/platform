import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Desktop binaries are public. Never compile a general environment file into
// them: only these explicitly reviewed client settings may cross that boundary.
export const PUBLIC_KEYS = new Set([
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'API_BASE_URL',
  'TASKS_API_BASE_URL',
  'FINANCE_API_BASE_URL',
  'INVENTORY_API_BASE_URL',
  'CONTACTS_API_BASE_URL',
  'CALENDAR_API_BASE_URL',
  'TEACH_API_BASE_URL',
  'TRACK_API_BASE_URL',
  'MAIL_API_BASE_URL',
  'INFRASTRUCTURE_API_BASE_URL',
  'TURNSTILE_SITE_KEY',
  'TURNSTILE_BASE_URL',
  'GOOGLE_WEB_CLIENT_ID',
  'GOOGLE_IOS_CLIENT_ID',
  'MOBILE_TASK_DESCRIPTION_EDITING_ENABLED',
  'MOBILE_CALENDAR_INTEGRATIONS_ENABLED',
]);

function isPublishableKey(value) {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return true;
  try {
    const parts = value.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url'));
    // Legacy public anon JWTs are valid; service_role JWTs never are.
    return payload.role === 'anon' && payload.iss === 'supabase';
  } catch {
    return false;
  }
}

export function validatePublicConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Public build configuration must be an object');
  }
  for (const [key, value] of Object.entries(input)) {
    if (!PUBLIC_KEYS.has(key)) {
      throw new Error('Unapproved field in public build configuration');
    }
    if (
      typeof value !== 'string' ||
      value.length > 4096 ||
      /[\r\n\0]/.test(value)
    ) {
      throw new Error(`Invalid public setting: ${key}`);
    }
    if (key.endsWith('_URL') && value) {
      const url = new URL(value);
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      ) {
        throw new Error(`Invalid public URL: ${key}`);
      }
      const expectedHost =
        key === 'NEXT_PUBLIC_SUPABASE_URL'
          ? /^[a-z0-9-]+\.supabase\.co$/
          : /^(?:[a-z0-9-]+\.)?tuturuuu\.com$/;
      if (!expectedHost.test(url.hostname)) {
        throw new Error(`Unexpected public origin: ${key}`);
      }
    }
    if (key.endsWith('_ENABLED') && !['true', 'false'].includes(value)) {
      throw new Error(`Invalid feature flag: ${key}`);
    }
  }
  for (const key of [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'API_BASE_URL',
  ]) {
    if (!input[key]) throw new Error(`Missing public setting: ${key}`);
  }
  if (!isPublishableKey(input.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)) {
    throw new Error('Supabase key must be a public publishable or anon key');
  }
  return { ...input };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const [source, destination] = process.argv.slice(2);
    if (!source || !destination)
      throw new Error('Expected source and destination paths');
    const config = validatePublicConfig(
      JSON.parse(await readFile(source, 'utf8'))
    );
    await writeFile(destination, `${JSON.stringify(config)}\n`, {
      mode: 0o600,
    });
  } catch {
    // Parsing errors can contain fragments of the input. Never print them.
    process.stderr.write('Desktop public configuration validation failed.\n');
    process.exitCode = 1;
  }
}
