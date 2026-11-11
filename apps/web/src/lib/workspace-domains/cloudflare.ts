/**
 * Minimal Cloudflare API client for workspace domains: Cloudflare for SaaS
 * custom hostnames, proxied DNS records for `<label>.ttr.gg`, and per-host
 * Worker routes to the `tuturuuu-workspace-domains` edge Worker. Every call
 * is bounded (timeout, no retries); callers re-run verification to retry.
 * Framework-free: credentials and fetch are injected.
 */

export const WORKSPACE_DOMAINS_WORKER_SCRIPT = 'tuturuuu-workspace-domains';
const API_ORIGIN = 'https://api.cloudflare.com/client/v4';
const TIMEOUT_MS = 10_000;

export interface CloudflareDomainsConfig {
  apiToken: string;
  zoneId: string;
  workerScript: string;
  sslMethod: 'http' | 'txt';
  /** Target for proxied platform-subdomain records. */
  platformRecordTarget: string;
}

export interface CloudflareCustomHostname {
  id: string;
  hostname: string;
  status: string;
  ssl?: {
    status?: string;
    validation_records?: Array<{
      txt_name?: string;
      txt_value?: string;
      http_url?: string;
      http_body?: string;
    }>;
    validation_errors?: Array<{ message?: string }>;
  };
  ownership_verification?: { type?: string; name?: string; value?: string };
  verification_errors?: string[];
}

/** Cloudflare error codes for "this resource already exists". */
const CONFLICT_CODES = new Set([
  // DNS: record already exists, identical record, CNAME/other-type clash.
  81053, 81054, 81055, 81057, 81058,
  // Workers routes: duplicate pattern.
  10020,
  // Custom hostnames: duplicate hostname.
  1406, 1407, 1414,
]);

export class CloudflareApiError extends Error {
  constructor(
    readonly status: number,
    readonly codes: number[],
    /** The provider said the resource already exists. */
    readonly alreadyExists = false
  ) {
    super(`Cloudflare API request failed (${status})`);
  }

  get conflict() {
    return (
      this.alreadyExists ||
      this.status === 409 ||
      this.codes.some((code) => CONFLICT_CODES.has(code))
    );
  }
}

export interface CloudflareDnsRecordSummary {
  id: string;
  type: string;
  name: string;
}
export interface CloudflareWorkerRoute {
  id: string;
  pattern: string;
  script?: string | null;
}

/**
 * Whether a Workers route pattern applies to a hostname. Route host parts
 * match exactly, or as a suffix after a leading `*` (`*.ttr.gg`, `*ttr.gg`).
 * Any path counts: a route on a path of the host still owns that host.
 */
export function workerRouteMatchesHost(pattern: string, hostname: string) {
  const withoutScheme = pattern
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//u, '');
  const hostPart = withoutScheme.split('/')[0] ?? '';
  if (!hostPart) return false;
  if (hostPart === '*') return true;
  if (hostPart.startsWith('*')) return hostname.endsWith(hostPart.slice(1));
  return hostPart === hostname;
}

/** Reads provider configuration from the environment; null when unconfigured. */
export function cloudflareDomainsConfigFromEnv(
  env: Record<string, string | undefined> = process.env
): CloudflareDomainsConfig | null {
  const apiToken = env.CLOUDFLARE_SAAS_API_TOKEN?.trim();
  const zoneId = env.CLOUDFLARE_SAAS_ZONE_ID?.trim();
  if (!apiToken || !zoneId || !/^[a-f0-9]{32}$/u.test(zoneId)) return null;
  return {
    apiToken,
    zoneId,
    workerScript:
      env.WORKSPACE_DOMAINS_WORKER_SCRIPT?.trim() ||
      WORKSPACE_DOMAINS_WORKER_SCRIPT,
    sslMethod: env.CLOUDFLARE_SAAS_SSL_METHOD === 'txt' ? 'txt' : 'http',
    platformRecordTarget: '100::',
  };
}

type Fetch = typeof fetch;

export function createCloudflareDomainsClient(
  config: CloudflareDomainsConfig,
  fetchImpl: Fetch = fetch
) {
  async function call<T>(
    path: string,
    init: { method?: string; body?: unknown } = {}
  ): Promise<T> {
    const response = await fetchImpl(`${API_ORIGIN}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const payload = (await response.json().catch(() => null)) as {
      success?: boolean;
      result?: T;
      errors?: Array<{ code?: number; message?: string }>;
    } | null;
    if (!response.ok || !payload?.success) {
      // Never surface the token or raw provider bodies to callers.
      const errors = payload?.errors ?? [];
      throw new CloudflareApiError(
        response.status,
        errors
          .map((error) => error.code)
          .filter((code): code is number => typeof code === 'number'),
        errors.some((error) =>
          /already exist|duplicate/iu.test(error.message ?? '')
        )
      );
    }
    return payload.result as T;
  }

  const zone = `/zones/${config.zoneId}`;

  return {
    /** Every DNS record (all types) at exactly this name. */
    listDnsRecords(name: string) {
      return call<CloudflareDnsRecordSummary[]>(
        `${zone}/dns_records?name=${encodeURIComponent(name)}&per_page=100`
      );
    },
    /** Every Workers route on the zone (zones hold at most a few hundred). */
    listWorkerRoutes() {
      return call<CloudflareWorkerRoute[]>(`${zone}/workers/routes`);
    },
    createCustomHostname(hostname: string) {
      return call<CloudflareCustomHostname>(`${zone}/custom_hostnames`, {
        method: 'POST',
        body: {
          hostname,
          ssl: { method: config.sslMethod, type: 'dv' },
        },
      });
    },
    getCustomHostname(id: string) {
      return call<CloudflareCustomHostname>(
        `${zone}/custom_hostnames/${encodeURIComponent(id)}`
      );
    },
    async deleteCustomHostname(id: string) {
      await ignoreNotFound(
        call(`${zone}/custom_hostnames/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        })
      );
    },
    async createPlatformRecord(hostname: string) {
      const result = await call<{ id: string }>(`${zone}/dns_records`, {
        method: 'POST',
        body: {
          type: 'AAAA',
          name: hostname,
          content: config.platformRecordTarget,
          proxied: true,
          ttl: 1,
          comment: 'workspace domain (tuturuuu-workspace-domains)',
        },
      });
      return result.id;
    },
    async deleteDnsRecord(id: string) {
      await ignoreNotFound(
        call(`${zone}/dns_records/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        })
      );
    },
    async createWorkerRoute(hostname: string) {
      const result = await call<{ id: string }>(`${zone}/workers/routes`, {
        method: 'POST',
        body: { pattern: `${hostname}/*`, script: config.workerScript },
      });
      return result.id;
    },
    async deleteWorkerRoute(id: string) {
      await ignoreNotFound(
        call(`${zone}/workers/routes/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        })
      );
    },
  };
}

export type CloudflareDomainsClient = ReturnType<
  typeof createCloudflareDomainsClient
>;

async function ignoreNotFound(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof CloudflareApiError && error.status === 404) return;
    throw error;
  }
}

/** DNS records the customer must publish for a custom hostname. */
export function customHostnameDnsRecords(hostname: CloudflareCustomHostname) {
  const records: Array<{ type: 'TXT'; name: string; value: string }> = [];
  const ownership = hostname.ownership_verification;
  if (ownership?.type === 'txt' && ownership.name && ownership.value) {
    records.push({ type: 'TXT', name: ownership.name, value: ownership.value });
  }
  for (const record of hostname.ssl?.validation_records ?? []) {
    if (record.txt_name && record.txt_value) {
      records.push({
        type: 'TXT',
        name: record.txt_name,
        value: record.txt_value,
      });
    }
  }
  return records;
}
