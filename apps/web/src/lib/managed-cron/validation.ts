import 'server-only';

import net from 'node:net';
import parser from 'cron-parser';
import { z } from 'zod';

export const MANAGED_CRON_DEFAULT_TIMEOUT_MS = 15_000;
export const MANAGED_CRON_MAX_RESPONSE_CHARS = 12_000;
export const MANAGED_CRON_USER_AGENT = 'Tuturuuu-Managed-Cron/1.0';

export const MANAGED_CRON_HTTP_METHODS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
] as const;

export type ManagedCronHttpMethod = (typeof MANAGED_CRON_HTTP_METHODS)[number];

export interface ManagedCronHeaderConfig {
  name: string;
  secretName?: string | null;
  value?: string | null;
}

export interface ManagedCronEndpointValidationResult {
  hostname?: string;
  message?: string;
  ok: boolean;
  url?: string;
}

const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u;
const SECRET_NAME_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/u;
const DOMAIN_LABEL_PATTERN = /^(?!-)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const FORBIDDEN_MANAGED_HEADERS = new Set([
  'connection',
  'content-length',
  'cookie',
  'host',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function emptyStringToNull(value: unknown) {
  return typeof value === 'string' && value.trim() === '' ? null : value;
}

export const managedCronHeaderConfigSchema = z
  .array(
    z
      .object({
        name: z.string().trim().min(1).max(128).regex(HEADER_NAME_PATTERN),
        secretName: z
          .preprocess(
            emptyStringToNull,
            z.string().trim().regex(SECRET_NAME_PATTERN).nullable().optional()
          )
          .default(null),
        value: z
          .preprocess(
            emptyStringToNull,
            z.string().max(4096).nullable().optional()
          )
          .default(null),
      })
      .superRefine((header, context) => {
        const lowerName = header.name.toLowerCase();
        if (FORBIDDEN_MANAGED_HEADERS.has(lowerName)) {
          context.addIssue({
            code: 'custom',
            message: `Header ${header.name} cannot be managed by cron jobs.`,
            path: ['name'],
          });
        }

        if (!header.secretName && !header.value) {
          context.addIssue({
            code: 'custom',
            message: 'Provide a static value or a workspace secret name.',
          });
        }
      })
  )
  .max(20)
  .default([]);

export const managedCronJobPayloadSchema = z.object({
  active: z.boolean().default(true),
  dataset_id: z
    .preprocess(emptyStringToNull, z.string().uuid().nullable().optional())
    .default(null),
  endpoint_url: z
    .preprocess(
      emptyStringToNull,
      z.string().trim().url().nullable().optional()
    )
    .default(null),
  headers_config: managedCronHeaderConfigSchema,
  http_method: z.enum(MANAGED_CRON_HTTP_METHODS).default('GET'),
  name: z.string().trim().min(1).max(200),
  retry_count: z.coerce.number().int().min(0).max(3).default(0),
  schedule: z.string().trim().min(1).max(120),
  timeout_ms: z.coerce
    .number()
    .int()
    .min(1000)
    .max(60000)
    .default(MANAGED_CRON_DEFAULT_TIMEOUT_MS),
});

export type ManagedCronJobPayload = z.infer<typeof managedCronJobPayloadSchema>;

export function getNextManagedCronRunAt(
  schedule: string,
  currentDate: Date = new Date()
) {
  const interval = parser.parse(schedule, { currentDate });
  return interval.next().toDate();
}

export function assertValidManagedCronSchedule(schedule: string) {
  getNextManagedCronRunAt(schedule);
}

export function normalizeManagedCronDomain(input: string) {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    throw new Error('Domain is required');
  }

  let domain = trimmed;
  if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(trimmed)) {
    domain = new URL(trimmed).hostname.toLowerCase();
  }

  domain = domain.replace(/\.$/u, '');

  if (
    !domain ||
    domain.includes('*') ||
    domain.includes('/') ||
    domain.length > 253
  ) {
    throw new Error('Invalid domain');
  }

  if (net.isIP(domain) !== 0 || isBlockedHostname(domain)) {
    throw new Error('Managed cron domains must be public hostnames');
  }

  const labels = domain.split('.');
  if (
    labels.length < 2 ||
    labels.some((label) => !DOMAIN_LABEL_PATTERN.test(label))
  ) {
    throw new Error('Invalid domain');
  }

  return domain;
}

export function isHostnameAllowedByManagedCronDomain(
  hostname: string,
  domain: string
) {
  const normalizedHostname = hostname.toLowerCase().replace(/\.$/u, '');
  const normalizedDomain = domain.toLowerCase().replace(/\.$/u, '');

  return (
    normalizedHostname === normalizedDomain ||
    normalizedHostname.endsWith(`.${normalizedDomain}`)
  );
}

export function validateManagedCronEndpointUrl(
  value: string,
  allowedDomains: string[]
): ManagedCronEndpointValidationResult {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, message: 'Endpoint URL is invalid.' };
  }

  if (url.protocol !== 'https:') {
    return { ok: false, message: 'Endpoint URL must use HTTPS.' };
  }

  if (url.username || url.password) {
    return { ok: false, message: 'Endpoint URL cannot include credentials.' };
  }

  const hostname = url.hostname.toLowerCase();
  if (net.isIP(hostname) !== 0 || isBlockedHostname(hostname)) {
    return {
      ok: false,
      message: 'Endpoint URL must use a public whitelisted hostname.',
    };
  }

  const whitelisted = allowedDomains.some((domain) =>
    isHostnameAllowedByManagedCronDomain(hostname, domain)
  );

  if (!whitelisted) {
    return {
      hostname,
      ok: false,
      message: 'Endpoint hostname is not whitelisted for managed cron.',
    };
  }

  url.hash = '';

  return {
    hostname,
    ok: true,
    url: url.toString(),
  };
}

export function collectManagedCronHeaderSecretNames(
  headers: ManagedCronHeaderConfig[]
) {
  return [
    ...new Set(
      headers
        .map((header) => header.secretName?.trim())
        .filter((name): name is string => Boolean(name))
    ),
  ];
}

export function resolveManagedCronRequestHeaders({
  config,
  secrets,
}: {
  config: ManagedCronHeaderConfig[];
  secrets: Map<string, string>;
}) {
  const headers = new Headers();
  headers.set('User-Agent', MANAGED_CRON_USER_AGENT);

  for (const header of config) {
    const value = header.secretName
      ? secrets.get(header.secretName)
      : header.value;

    if (header.secretName && value === undefined) {
      throw new Error(`Missing workspace secret ${header.secretName}`);
    }

    if (value !== undefined && value !== null) {
      headers.set(header.name, value);
    }
  }

  return headers;
}

function isBlockedHostname(hostname: string) {
  const normalized = hostname.toLowerCase();

  if (
    normalized === 'localhost' ||
    normalized === '0.0.0.0' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local')
  ) {
    return true;
  }

  if (
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd')
  ) {
    return true;
  }

  const parts = normalized.split('.').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }

  const [first = 0, second = 0] = parts;
  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 169 && second === 254) ||
    (first === 192 && second === 168)
  );
}
