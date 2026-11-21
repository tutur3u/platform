// Cloudflare data access for the Performance Factory detector. Every query is
// returned with its text and variables so a regression record can carry a
// reproducible query instead of raw data. The API token is read from the
// environment by name and never echoed, logged or stored.

export const GRAPHQL_URL = 'https://api.cloudflare.com/client/v4/graphql';
export const API_BASE = 'https://api.cloudflare.com/client/v4';
export const TOKEN_ENV = 'CLOUDFLARE_API_TOKEN';
export const ACCOUNT_ENV = 'CLOUDFLARE_ACCOUNT_ID';
export const ZONE_ENV = 'CLOUDFLARE_ZONE_ID';

const WINDOW_DIMENSION = {
  5: 'datetimeFiveMinutes',
  15: 'datetimeFifteenMinutes',
  60: 'datetimeHour',
};

export function windowDimension(minutes) {
  const dimension = WINDOW_DIMENSION[minutes];
  if (!dimension) {
    throw new Error(`window must be one of ${Object.keys(WINDOW_DIMENSION)}`);
  }
  return dimension;
}

/** Path filter covering the mount and its locale-prefixed variants. */
export function pathFilter(app) {
  const prefixes = app.prefixes.flatMap((prefix) => [
    prefix,
    ...(app.locales ?? []).map((locale) => `/${locale}${prefix}`),
  ]);
  return prefixes.map((prefix) => ({ clientRequestPath_like: `${prefix}%` }));
}

/**
 * Cloudflare's own Early Hints cache fetches (UAs like 'nginx-ssl early hints')
 * are not client traffic: on tuturuuu.com they return instant synthetic 504s
 * at a chronic 69-82% rate while real clients see none, so they are excluded
 * from every window (requests, latency and errors) to keep the metric about
 * users. See perf-roadmap-error_rate-2026-11-21T033000000Z.
 */
export const EXCLUDED_REQUEST_SOURCE = 'earlyHintsCache';

/**
 * Gateway-side p95 TTFB, request count and 5xx count per window for one app
 * mount. Two aliases share the same filter so totals and errors line up.
 */
export function buildZoneLatencyQuery({ app, since, until, windowMinutes }) {
  const dimension = windowDimension(windowMinutes);
  const query = `query PerfFactoryZoneLatency($zoneTag: string!, $filter: ZoneHttpRequestsAdaptiveGroupsFilter_InputObject!, $errorFilter: ZoneHttpRequestsAdaptiveGroupsFilter_InputObject!) {
  viewer {
    zones(filter: { zoneTag: $zoneTag }) {
      total: httpRequestsAdaptiveGroups(filter: $filter, limit: 2000, orderBy: [${dimension}_ASC]) {
        count
        dimensions { ${dimension} }
        quantiles { edgeTimeToFirstByteMsP50 edgeTimeToFirstByteMsP95 edgeTimeToFirstByteMsP99 originResponseDurationMsP95 }
      }
      errors: httpRequestsAdaptiveGroups(filter: $errorFilter, limit: 2000, orderBy: [${dimension}_ASC]) {
        count
        dimensions { ${dimension} }
      }
    }
  }
}`;
  const filter = {
    datetime_geq: since,
    datetime_lt: until,
    clientRequestHTTPHost: app.host,
    requestSource_neq: EXCLUDED_REQUEST_SOURCE,
    OR: pathFilter(app),
  };
  return {
    name: 'zone-latency',
    query,
    variables: {
      zoneTag: `$${ZONE_ENV}`,
      filter,
      errorFilter: { ...filter, edgeResponseStatus_geq: 500 },
    },
  };
}

/** Worker CPU and wall time per script version, for per-version forensics. */
export function buildWorkerVersionQuery({ app, since, until }) {
  const query = `query PerfFactoryWorkerVersions($accountTag: string!, $filter: AccountWorkersInvocationsAdaptiveFilter_InputObject!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      workersInvocationsAdaptive(filter: $filter, limit: 100) {
        dimensions { scriptName scriptVersion }
        sum { requests errors subrequests }
        quantiles { cpuTimeP50 cpuTimeP99 wallTimeP50 wallTimeP99 }
      }
    }
  }
}`;
  return {
    name: 'worker-versions',
    query,
    variables: {
      accountTag: `$${ACCOUNT_ENV}`,
      filter: {
        datetime_geq: since,
        datetime_lt: until,
        scriptName: app.worker,
      },
    },
  };
}

export function readCredentials(env = process.env) {
  const missing = [TOKEN_ENV, ACCOUNT_ENV, ZONE_ENV].filter(
    (name) => !env[name]
  );
  if (missing.length) {
    throw new Error(`missing environment variables: ${missing.join(', ')}`);
  }
  return {
    token: env[TOKEN_ENV],
    accountId: env[ACCOUNT_ENV],
    zoneId: env[ZONE_ENV],
  };
}

function resolveVariables(variables, credentials) {
  const text = JSON.stringify(variables)
    .replaceAll(`"$${ZONE_ENV}"`, JSON.stringify(credentials.zoneId))
    .replaceAll(`"$${ACCOUNT_ENV}"`, JSON.stringify(credentials.accountId));
  return JSON.parse(text);
}

/** Never let a token reach output, even if an upstream error echoes it. */
export function redact(text, credentials) {
  let result = String(text);
  if (credentials?.token) result = result.replaceAll(credentials.token, '***');
  return result;
}

async function request(fetchImpl, url, init, credentials) {
  const response = await fetchImpl(url, {
    ...init,
    headers: {
      authorization: `Bearer ${credentials.token}`,
      'content-type': 'application/json',
    },
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.errors?.length || payload?.success === false) {
    const detail = JSON.stringify(
      payload?.errors ?? payload ?? response.status
    );
    throw new Error(
      redact(
        `Cloudflare request failed (${response.status}): ${detail}`,
        credentials
      )
    );
  }
  return payload;
}

export async function runGraphql(spec, credentials, fetchImpl = fetch) {
  const payload = await request(
    fetchImpl,
    GRAPHQL_URL,
    {
      method: 'POST',
      body: JSON.stringify({
        query: spec.query,
        variables: resolveVariables(spec.variables, credentials),
      }),
    },
    credentials
  );
  return payload.data;
}

/** Merge total and error groups into windows ordered oldest first. */
export function parseZoneWindows(data, windowMinutes) {
  const dimension = windowDimension(windowMinutes);
  const zone = data?.viewer?.zones?.[0] ?? {};
  const errorsByStart = new Map(
    (zone.errors ?? []).map((group) => [
      group.dimensions[dimension],
      group.count,
    ])
  );
  return (zone.total ?? [])
    .map((group) => {
      const start = new Date(group.dimensions[dimension]).toISOString();
      return {
        start,
        end: new Date(Date.parse(start) + windowMinutes * 60_000).toISOString(),
        requests: group.count,
        errors: errorsByStart.get(group.dimensions[dimension]) ?? 0,
        p95Ms: group.quantiles?.edgeTimeToFirstByteMsP95 ?? null,
        p99Ms: group.quantiles?.edgeTimeToFirstByteMsP99 ?? null,
        originP95Ms: group.quantiles?.originResponseDurationMsP95 ?? null,
      };
    })
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

const SHA = /\b[0-9a-f]{7,40}\b/;

/** Deployments for a Worker script, flattened to the dominant version. */
export async function fetchDeploys(app, credentials, fetchImpl = fetch) {
  const base = `${API_BASE}/accounts/${credentials.accountId}/workers/scripts/${encodeURIComponent(app.worker)}`;
  const [deployments, versions] = await Promise.all([
    request(fetchImpl, `${base}/deployments`, { method: 'GET' }, credentials),
    request(fetchImpl, `${base}/versions`, { method: 'GET' }, credentials),
  ]);
  return parseDeploys(deployments, versions);
}

export function parseDeploys(deploymentsPayload, versionsPayload) {
  const versions = new Map(
    (versionsPayload?.result?.items ?? []).map((version) => [
      version.id,
      version,
    ])
  );
  return (deploymentsPayload?.result?.deployments ?? []).map((deployment) => {
    const dominant = [...(deployment.versions ?? [])].sort(
      (a, b) => b.percentage - a.percentage
    )[0];
    const version = versions.get(dominant?.version_id);
    const annotations = version?.annotations ?? {};
    const label = `${annotations['workers/tag'] ?? ''} ${annotations['workers/message'] ?? ''}`;
    return {
      deploymentId: deployment.id,
      createdAt: deployment.created_on,
      versionId: dominant?.version_id ?? null,
      percentage: dominant?.percentage ?? null,
      sha: label.match(SHA)?.[0] ?? null,
      message: annotations['workers/message'] ?? null,
    };
  });
}
