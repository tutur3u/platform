import { z } from 'zod';
import { CLI_EXIT, CliError } from '../cli-contracts';
import { CLI_ENVS, type CliEnv, resolveTuturuuuOrigins } from '../cli-env';
import {
  assertNoCredentialLeak,
  createCredentialStore,
  ENV_VAR_BY_FAMILY,
} from '../credential-store';
import {
  assertSafeParsedValue,
  assertSafeResponseText,
  buildTraceHeaders,
} from '../upskii/http';

const CF_ORIGIN = 'https://api.cloudflare.com';
const CF_API = '/client/v4';
const ADMIN_API = ['', 'api', 'v1', 'infrastructure'].join('/');
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_PAGES = 100;
const CF_ID = /^[a-f0-9]{32}$/iu;
const RESOURCE_NAME = /^[a-z0-9][a-z0-9_-]{0,127}$/iu;
const SENSITIVE_HEADERS = new Set(
  'set-cookie authorization cookie x-api-key x-auth-key'.split(' ')
);
// Cloudflare's REST edge emits non-auth bot/LB cookies on every response.
const CLOUDFLARE_EDGE_COOKIES = new Set([
  '__cf_bm',
  '__cflb',
  '_cfuvid',
  'cf_clearance',
]);
const BEARER_TOKEN = /^[A-Za-z0-9_.~+/=-]{6,}$/u;
// RFC 6265 cookie-octets excluding comma, quotes, backslash, and whitespace so a
// comma-folded Set-Cookie header cannot sneak a second cookie past validation.
const SAFE_COOKIE_VALUE = /^[!#$%&'()*+\-./0-9:<=>?@A-Z[\]^_`a-z{|}~]+$/u;
const SAFE_COOKIE_DOMAIN =
  /^\.?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/iu;
const SAFE_COOKIE_PATH = /^\/[^\s,;]*$/u;
const SAFE_COOKIE_EXPIRES =
  /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+(\d{1,2})([ -])(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\3(\d{2}|\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s+GMT$/iu;
const COOKIE_WEEKDAYS = new Map<string, number>([
  ['sun', 0],
  ['sunday', 0],
  ['mon', 1],
  ['monday', 1],
  ['tue', 2],
  ['tuesday', 2],
  ['wed', 3],
  ['wednesday', 3],
  ['thu', 4],
  ['thursday', 4],
  ['fri', 5],
  ['friday', 5],
  ['sat', 6],
  ['saturday', 6],
]);
const COOKIE_MONTHS = new Map<string, number>([
  ['jan', 0],
  ['feb', 1],
  ['mar', 2],
  ['apr', 3],
  ['may', 4],
  ['jun', 5],
  ['jul', 6],
  ['aug', 7],
  ['sep', 8],
  ['oct', 9],
  ['nov', 10],
  ['dec', 11],
]);
const SAFE_COOKIE_BOOL_ATTRS = new Set(['httponly', 'secure', 'partitioned']);

function isValidCookieExpires(value: string): boolean {
  const match = SAFE_COOKIE_EXPIRES.exec(value);
  if (!match) return false;
  const weekday = COOKIE_WEEKDAYS.get((match[1] ?? '').toLowerCase());
  const day = Number(match[2]);
  const month = COOKIE_MONTHS.get((match[4] ?? '').toLowerCase());
  const rawYear = match[5] ?? '';
  const yearNum = Number(rawYear);
  const year =
    rawYear.length === 2
      ? yearNum >= 70
        ? 1900 + yearNum
        : 2000 + yearNum
      : yearNum;
  const hour = Number(match[6]);
  const minute = Number(match[7]);
  const second = Number(match[8]);
  if (
    weekday === undefined ||
    month === undefined ||
    year < 1601 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return false;
  }
  const date = new Date(Date.UTC(year, month, day, hour, minute, second));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month &&
    date.getUTCDate() === day &&
    date.getUTCDay() === weekday
  );
}

function blockCredentialLeak(): never {
  throw new CliError({
    code: 'CREDENTIAL_LEAK_BLOCKED',
    exitCode: CLI_EXIT.policy,
    message: 'Credential output blocked.',
  });
}

function isSafeCloudflareEdgeSetCookie(rawCookie: string): boolean {
  if (!rawCookie || /[\u0000-\u001f\u007f]/u.test(rawCookie)) return false;
  const parts = rawCookie.split(';');
  const pair = parts[0]?.trim() ?? '';
  const eq = pair.indexOf('=');
  if (eq <= 0) return false;
  const name = pair.slice(0, eq);
  if (!CLOUDFLARE_EDGE_COOKIES.has(name)) return false;
  let value = pair.slice(eq + 1);
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1);
  }
  if (!SAFE_COOKIE_VALUE.test(value)) return false;

  for (let i = 1; i < parts.length; i += 1) {
    const attr = parts[i]?.trim() ?? '';
    if (!attr) return false;
    const attrEq = attr.indexOf('=');
    if (attrEq === -1) {
      if (!SAFE_COOKIE_BOOL_ATTRS.has(attr.toLowerCase())) return false;
      continue;
    }
    const attrName = attr.slice(0, attrEq).trim().toLowerCase();
    const attrValue = attr.slice(attrEq + 1).trim();
    if (!attrValue) return false;
    if (attrName === 'expires') {
      if (!isValidCookieExpires(attrValue)) return false;
    } else if (attrName === 'max-age') {
      if (!/^-?\d+$/u.test(attrValue)) return false;
    } else if (attrName === 'domain') {
      if (!SAFE_COOKIE_DOMAIN.test(attrValue)) return false;
    } else if (attrName === 'path') {
      if (!SAFE_COOKIE_PATH.test(attrValue)) return false;
    } else if (attrName === 'samesite') {
      if (!/^(?:lax|strict|none)$/iu.test(attrValue)) return false;
    } else if (attrName === 'priority') {
      if (!/^(?:low|medium|high)$/iu.test(attrValue)) return false;
    } else {
      return false;
    }
  }
  return true;
}

export const dnsRecordTypeSchema = z.enum(['A', 'AAAA', 'CNAME', 'TXT', 'MX']);
type DnsRecordType = z.infer<typeof dnsRecordTypeSchema>;
type EnvVars = Record<string, string | undefined>;
type Secrets = readonly (string | null | undefined)[];

export function infraEnvSecrets(envVars: EnvVars): Secrets {
  return Object.values(ENV_VAR_BY_FAMILY).flatMap((names) =>
    names.flatMap((name) => [
      envVars[name],
      ...CLI_ENVS.map((env) => envVars[`${name}_${env.toUpperCase()}`]),
    ])
  );
}

export function assertSafeInfraText(text: string, secrets: Secrets): void {
  assertSafeResponseText(text, secrets);
  // Detect escaped credentials even in raw bodies and non-JSON headers.
  const decoded = text.replace(
    /%(?:25)*([0-9a-f]{2})|\\u([0-9a-f]{4})/giu,
    (part, hex: string | undefined, unicode: string | undefined) => {
      const value = hex ?? unicode;
      return value ? String.fromCharCode(Number.parseInt(value, 16)) : part;
    }
  );
  assertNoCredentialLeak(decoded, secrets);
  if (
    /\bBearer\s+[A-Za-z0-9_.~+/=-]{6,}/iu.test(decoded) ||
    /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/u.test(decoded) ||
    /"(?:access[-_]?token|refresh[-_]?token|authorization|token|password|secret|api[-_]?key|cookie)"\s*:\s*"[^"]/iu.test(
      decoded
    )
  ) {
    throw new CliError({
      code: 'CREDENTIAL_LEAK_BLOCKED',
      exitCode: CLI_EXIT.policy,
      message: 'Credential output blocked.',
    });
  }
}

export function assertSafeInfraValue(value: unknown, secrets: Secrets): void {
  assertSafeParsedValue(value, secrets);
  const serialized = JSON.stringify(value);
  if (serialized !== undefined) assertSafeInfraText(serialized, secrets);
}

const rowsSchema = z.array(z.record(z.string(), z.unknown()));
const cfEnvelope = z.object({
  result: rowsSchema,
  result_info: z
    .object({
      total_pages: z.number().int().nonnegative().optional(),
    })
    .optional(),
  success: z.literal(true),
});
const devboxesSnapshot = z.object({ runners: rowsSchema });
const projectList = z.discriminatedUnion('configured', [
  z.object({ configured: z.literal(false) }),
  z.object({ configured: z.literal(true), projects: rowsSchema }),
]);
const projectDetail = z.discriminatedUnion('configured', [
  z.object({ configured: z.literal(false) }),
  z.object({
    configured: z.literal(true),
    project: z.object({ id: z.string() }),
    environments: z.record(z.string(), z.unknown()),
  }),
]);
const deploymentState = z.object({
  ok: z.literal(true),
  state: z.object({ lanes: z.array(z.object({ deployments: rowsSchema })) }),
});

type InfraRow = z.infer<typeof rowsSchema>[number];

function projectFields(row: InfraRow, keys: readonly string[]): InfraRow {
  return Object.fromEntries(
    keys.filter((key) => Object.hasOwn(row, key)).map((key) => [key, row[key]])
  );
}

const ZONE_FIELDS = ['id', 'name', 'status', 'type', 'paused'];
const WORKER_FIELDS = ['id', 'created_on', 'modified_on', 'compatibility_date'];
const DNS_FIELDS = 'id type name content ttl proxied priority'.split(' ');
const RUNNER_FIELDS =
  'id name status last_heartbeat_at heartbeat_enabled drained enabled_features'.split(
    ' '
  );
const HOST_FIELDS = 'id name status last_heartbeat_at resource_limits'.split(
  ' '
);
const PROJECT_FIELDS = ['id', 'provider', 'workflows'];
const DEPLOY_FIELDS =
  'id project environment lane kind status sha createdAt updatedAt'.split(' ');

function invalidResponse(): CliError {
  return new CliError({
    code: 'INFRA_INVALID_RESPONSE',
    exitCode: CLI_EXIT.unavailable,
    message: 'The infrastructure endpoint returned an unexpected response.',
  });
}

function parseResponse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw invalidResponse();
  return result.data;
}

function endpointError(status: number, requestId: string): CliError {
  const exitCode =
    status === 401 || status === 403
      ? CLI_EXIT.auth
      : status === 404
        ? CLI_EXIT.notFound
        : CLI_EXIT.unavailable;
  return new CliError({
    code: 'INFRA_HTTP_ERROR',
    exitCode,
    message: `Infrastructure GET failed with HTTP ${status}.`,
    requestId,
  });
}

function validResource(value: string, pattern: RegExp, label: string): string {
  if (!pattern.test(value)) {
    throw new CliError({
      code: 'INVALID_INFRA_TARGET',
      message: `Invalid ${label}.`,
    });
  }
  return value;
}

function requireConfigured(configured: boolean): asserts configured {
  if (!configured) {
    throw new CliError({
      code: 'INFRA_DEPLOYMENTS_UNCONFIGURED',
      exitCode: CLI_EXIT.unavailable,
      message:
        'The deployment coordinator is unconfigured in this environment.',
    });
  }
}

const TOKEN_VAR = {
  admin: 'TTR_INFRA_TOKEN',
  cloudflare: 'TTR_INFRA_CF_RO_TOKEN',
};
type Realm = keyof typeof TOKEN_VAR;

export interface InfraClientOptions {
  env: CliEnv;
  envVars?: EnvVars;
  profile?: string;
  fetch?: typeof globalThis.fetch;
  credentialStore?: Pick<ReturnType<typeof createCredentialStore>, 'get'>;
}

export function createInfraClient(options: InfraClientOptions) {
  const envVars = options.envVars ?? process.env;
  const adminOrigin = resolveTuturuuuOrigins(options.env, envVars).admin;
  const adminBaseUrl = new URL(adminOrigin);
  const adminBasePath = adminBaseUrl.pathname.replace(/\/+$/u, '');
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const secrets = new Set(infraEnvSecrets(envVars));
  const origins = { admin: adminOrigin, cloudflare: CF_ORIGIN };
  const realmBases = {
    admin: { basePath: adminBasePath, origin: adminBaseUrl.origin },
    cloudflare: { basePath: '', origin: CF_ORIGIN },
  };
  const accountId =
    envVars[`TTR_INFRA_CF_ACCOUNT_ID_${options.env.toUpperCase()}`] ??
    envVars.TTR_INFRA_CF_ACCOUNT_ID;

  async function tokenFor(realm: Realm): Promise<string> {
    const name = TOKEN_VAR[realm];
    const scopedName = `${name}_${options.env.toUpperCase()}`;
    // The shared infra family supports both env names. Expose only this realm's
    // namespace to its store lookup so the two bearer tokens cannot substitute.
    const store =
      options.credentialStore ??
      createCredentialStore({
        env: {
          [name]: envVars[name],
          [scopedName]: envVars[scopedName],
          [`${name}_ENV`]: envVars[`${name}_ENV`],
          TTR_CREDENTIAL_ENV: envVars.TTR_CREDENTIAL_ENV,
        },
      });
    const record = await store.get({
      env: options.env,
      family: 'infra',
      profile:
        options.profile ?? (realm === 'cloudflare' ? 'cloudflare' : 'default'),
    });
    if (record) {
      secrets.add(record.secret);
      const token = record.secret.trim();
      const boundEnv =
        envVars[`${name}_ENV`]?.trim().toLowerCase() ??
        envVars.TTR_CREDENTIAL_ENV?.trim().toLowerCase();
      const expectedEnvToken =
        envVars[scopedName]?.trim() ||
        (boundEnv === options.env ? envVars[name]?.trim() : undefined);
      const expectedScope = realm === 'admin' ? 'infra:read' : 'cf:read';
      if (
        record.family === 'infra' &&
        record.env === options.env &&
        BEARER_TOKEN.test(token) &&
        (!record.expiresAt || Date.parse(record.expiresAt) > Date.now()) &&
        (record.backend === 'env'
          ? token === expectedEnvToken
          : record.origin === origins[realm] &&
            record.scopes.includes(expectedScope))
      )
        return token;
    }
    throw new CliError({
      code: 'INFRA_CREDENTIAL_REQUIRED',
      exitCode: CLI_EXIT.auth,
      message: `A valid read credential bound to the selected ${realm} origin is required.`,
      hint: `Set ${scopedName} or configure an origin-bound infra profile.`,
    });
  }

  async function fetchReadOnly(url: URL, init: RequestInit, requestId: string) {
    if (init.method !== 'GET') {
      throw new CliError({
        code: 'INFRA_READ_ONLY',
        exitCode: CLI_EXIT.policy,
        message: 'Infrastructure requests must use GET.',
      });
    }
    try {
      const response = await fetchImpl(url, { ...init, redirect: 'error' });
      return { response, raw: await response.text() };
    } catch {
      throw new CliError({
        code: 'INFRA_HTTP_UNAVAILABLE',
        exitCode: CLI_EXIT.unavailable,
        message: 'Infrastructure GET failed before a response could be read.',
        requestId,
      });
    }
  }

  async function requestJson(
    realm: Realm,
    path: string,
    command: string,
    signal?: AbortSignal
  ): Promise<unknown> {
    const { basePath, origin } = realmBases[realm];
    const realmPrefix = realm === 'cloudflare' ? CF_API : ADMIN_API;
    const relative = new URL(path, origin);
    if (
      relative.origin !== origin ||
      !relative.pathname.startsWith(`${realmPrefix}/`)
    ) {
      throw new CliError({
        code: 'INFRA_UNSAFE_URL',
        exitCode: CLI_EXIT.policy,
        message: 'Infrastructure URL is outside the pinned API.',
      });
    }
    const url = new URL(
      `${basePath}${relative.pathname}${relative.search}`,
      origin
    );
    if (
      url.origin !== origin ||
      !url.pathname.startsWith(`${basePath}${realmPrefix}/`)
    ) {
      throw new CliError({
        code: 'INFRA_UNSAFE_URL',
        exitCode: CLI_EXIT.policy,
        message: 'Infrastructure URL is outside the pinned API.',
      });
    }
    const token = await tokenFor(realm);
    const knownSecrets = [...secrets];
    assertSafeInfraText(url.href, knownSecrets);
    const trace = buildTraceHeaders(command, options.env);
    assertSafeInfraValue(trace, knownSecrets);
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const { response, raw } = await fetchReadOnly(
      url,
      {
        method: 'GET',
        signal: requestSignal,
        headers: {
          ...trace,
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      },
      trace['X-TTR-Request-Id']
    );
    const hasGetSetCookie = typeof response.headers.getSetCookie === 'function';
    const setCookies = hasGetSetCookie ? response.headers.getSetCookie() : [];
    for (const cookieHeader of setCookies) {
      assertSafeInfraText(`set-cookie: ${cookieHeader}`, knownSecrets);
      if (
        realm !== 'cloudflare' ||
        !isSafeCloudflareEdgeSetCookie(cookieHeader)
      ) {
        blockCredentialLeak();
      }
    }
    for (const [name, value] of response.headers) {
      const lower = name.toLowerCase();
      if (lower === 'set-cookie') {
        if (!hasGetSetCookie || setCookies.length === 0) {
          assertSafeInfraText(`${name}: ${value}`, knownSecrets);
          blockCredentialLeak();
        }
        continue;
      }
      assertSafeInfraText(`${name}: ${value}`, knownSecrets);
      if (SENSITIVE_HEADERS.has(lower)) {
        blockCredentialLeak();
      }
    }
    assertSafeInfraText(raw, knownSecrets);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      if (response.ok) throw invalidResponse();
    }
    assertSafeInfraValue(parsed, knownSecrets);
    if (!response.ok)
      throw endpointError(response.status, trace['X-TTR-Request-Id']);
    return parsed;
  }

  async function cloudflareRows(
    path: string,
    command: string,
    paginated: boolean
  ) {
    const rows: InfraRow[] = [];
    const url = new URL(`${CF_API}${path}`, CF_ORIGIN);
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      if (paginated) url.searchParams.set('page', String(page));
      const response = parseResponse(
        cfEnvelope,
        await requestJson('cloudflare', `${url.pathname}${url.search}`, command)
      );
      rows.push(...response.result);
      if (!paginated || page >= (response.result_info?.total_pages ?? page))
        return rows;
    }
    throw new CliError({
      code: 'INFRA_PAGE_LIMIT',
      exitCode: CLI_EXIT.unavailable,
      message: 'Cloudflare inventory exceeded the page limit.',
    });
  }

  async function devboxRows(command: string, signal?: AbortSignal) {
    const parsed = await requestJson(
      'admin',
      '/api/v1/infrastructure/devboxes',
      command,
      signal
    );
    return parseResponse(devboxesSnapshot, parsed).runners;
  }

  return {
    async listCloudflareZones() {
      const rows = await cloudflareRows(
        '/zones?per_page=50',
        'infra cloudflare zones',
        true
      );
      return rows.map((row) => projectFields(row, ZONE_FIELDS));
    },
    async listWorkers() {
      if (!accountId) {
        throw new CliError({
          code: 'INFRA_CF_ACCOUNT_REQUIRED',
          message: 'Set TTR_INFRA_CF_ACCOUNT_ID for Workers inventory.',
        });
      }
      const id = validResource(accountId, CF_ID, 'Cloudflare account ID');
      const rows = await cloudflareRows(
        `/accounts/${id}/workers/scripts`,
        'infra workers',
        false
      );
      return rows.map((row) => projectFields(row, WORKER_FIELDS));
    },
    async listDeployments(workerName?: string, signal?: AbortSignal) {
      const target =
        workerName === undefined
          ? undefined
          : validResource(workerName, RESOURCE_NAME, 'deployment project name');
      const path = target
        ? `/api/v1/infrastructure/deployments/${target}`
        : '/api/v1/infrastructure/deployments';
      const parsed = await requestJson(
        'admin',
        path,
        'infra deploys list',
        signal
      );
      if (!target) {
        const result = parseResponse(projectList, parsed);
        requireConfigured(result.configured);
        return result.projects.map((row) => projectFields(row, PROJECT_FIELDS));
      }
      const result = parseResponse(projectDetail, parsed);
      requireConfigured(result.configured);
      if (target !== result.project.id) throw invalidResponse();
      const deploymentEnv = {
        prod: 'production',
        staging: 'staging',
        sandbox: 'preview',
        local: 'preview',
      };
      const environment = parseResponse(
        deploymentState,
        result.environments[deploymentEnv[options.env]]
      );
      return environment.state.lanes.flatMap(({ deployments }) =>
        deployments.map((row) => projectFields(row, DEPLOY_FIELDS))
      );
    },
    async listDnsRecords(zoneId: string, type?: DnsRecordType) {
      const id = validResource(zoneId, CF_ID, 'Cloudflare zone ID');
      const query = new URLSearchParams({ per_page: '100' });
      if (type) query.set('type', dnsRecordTypeSchema.parse(type));
      const rows = await cloudflareRows(
        `/zones/${id}/dns_records?${query}`,
        'infra dns-readonly list',
        true
      );
      return rows.map((row) => projectFields(row, DNS_FIELDS));
    },
    async listRunners(signal?: AbortSignal) {
      const rows = await devboxRows('infra runners', signal);
      return rows.map((row) => projectFields(row, RUNNER_FIELDS));
    },
    async listHosts() {
      const rows = await devboxRows('infra hosts');
      return rows.map((row) => projectFields(row, HOST_FIELDS));
    },
  };
}
