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

export class CloudflareApiError extends Error {
  constructor(
    readonly status: number,
    readonly codes: number[]
  ) {
    super(`Cloudflare API request failed (${status})`);
  }
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
      errors?: Array<{ code?: number }>;
    } | null;
    if (!response.ok || !payload?.success) {
      // Never surface the token or raw provider bodies to callers.
      throw new CloudflareApiError(
        response.status,
        (payload?.errors ?? [])
          .map((error) => error.code)
          .filter((code): code is number => typeof code === 'number')
      );
    }
    return payload.result as T;
  }

  const zone = `/zones/${config.zoneId}`;

  return {
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
