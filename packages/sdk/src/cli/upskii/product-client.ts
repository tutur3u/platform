import { installedBuildIdentity } from '../build-identity';
import { CLI_EXIT, CliError, type CliTraceHeaders } from '../cli-contracts';
import {
  type CliEnv,
  CLI_ENVS,
  resolveTuturuuuOrigins,
  resolveUpskiiOrigins,
  type UpskiiOrigins,
} from '../cli-env';
import { ENV_VAR_BY_FAMILY } from '../credential-store';
import {
  assertSafeParsedValue,
  assertSafeResponseText,
  readCookieFromStorageState,
} from './http';

const KNOWN_CREDENTIAL_PATTERN =
  /(?:upskii_cli_[ar]_[A-Za-z0-9_-]{8,}|(?:__Secure-)?[a-zA-Z0-9._-]*session[a-zA-Z0-9._-]*=[^\s;,"']{8,}|ttr_app_[A-Za-z0-9._-]{12,}|Bearer\s+[A-Za-z0-9._~+/=-]{16,}|eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/u;

const SECRET_JSON_KEY_PATTERN =
  /^(?:access_?token|refresh_?token|session_?token|id_?token|auth_?token|token|api_?key|client_?secret|secret|password|passwd|cookie|set_?cookie|authorization|bearer_?token|private_?key|jwt)$/iu;

const SAFE_D1_COUNT_PATTERN = /^\d{1,12}$/u;
const SAFE_D1_MS_PATTERN = /^\d{1,9}(?:\.\d{1,3})?$/u;
const SAFE_D1_REGION_PATTERN =
  /^[A-Z]{2,6}(?:-[A-Z0-9]{1,8})?(?:,[A-Z]{2,6}(?:-[A-Z0-9]{1,8})?){0,7}$/u;

const SAFE_D1_METRIC_PATTERNS: Readonly<Record<string, RegExp>> = Object.freeze(
  {
    'x-upskii-d1-all-call-count': SAFE_D1_COUNT_PATTERN,
    'x-upskii-d1-await-max-ms': SAFE_D1_MS_PATTERN,
    'x-upskii-d1-await-sample-count': SAFE_D1_COUNT_PATTERN,
    'x-upskii-d1-await-sum-ms': SAFE_D1_MS_PATTERN,
    'x-upskii-d1-batch-call-count': SAFE_D1_COUNT_PATTERN,
    'x-upskii-d1-batch-statement-count': SAFE_D1_COUNT_PATTERN,
    'x-upskii-d1-binding-call-count': SAFE_D1_COUNT_PATTERN,
    'x-upskii-d1-database-duration-ms': SAFE_D1_MS_PATTERN,
    'x-upskii-d1-duration-ms': SAFE_D1_MS_PATTERN,
    'x-upskii-d1-max-query-duration-ms': SAFE_D1_MS_PATTERN,
    'x-upskii-d1-meta-count': SAFE_D1_COUNT_PATTERN,
    'x-upskii-d1-primary-count': SAFE_D1_COUNT_PATTERN,
    'x-upskii-d1-queries': SAFE_D1_COUNT_PATTERN,
    'x-upskii-d1-query-count': SAFE_D1_COUNT_PATTERN,
    'x-upskii-d1-region': SAFE_D1_REGION_PATTERN,
    'x-upskii-d1-regions': SAFE_D1_REGION_PATTERN,
    'x-upskii-d1-replica-count': SAFE_D1_COUNT_PATTERN,
    'x-upskii-d1-retried-count': SAFE_D1_COUNT_PATTERN,
    'x-upskii-d1-rows-read': SAFE_D1_COUNT_PATTERN,
    'x-upskii-d1-rows-written': SAFE_D1_COUNT_PATTERN,
    'x-upskii-d1-served-by': SAFE_D1_REGION_PATTERN,
    'x-upskii-d1-size-after': /^\d{1,15}$/u,
    'x-upskii-d1-total-attempts': SAFE_D1_COUNT_PATTERN,
    'x-upskii-d1-unknown-count': SAFE_D1_COUNT_PATTERN,
  }
);

type BetterAuthResponseMode = 'get-session' | 'list-sessions';

function assertSafeJsonDepth(value: unknown, depth = 0): void {
  if (depth > 32) {
    throw new CliError({
      code: 'UPSKII_RESPONSE_TOO_DEEP',
      exitCode: CLI_EXIT.policy,
      message: 'Upskii response JSON nesting exceeded safe depth limit.',
    });
  }
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) assertSafeJsonDepth(item, depth + 1);
    return;
  }
  for (const key of Object.keys(value as Record<string, unknown>)) {
    assertSafeJsonDepth((value as Record<string, unknown>)[key], depth + 1);
  }
}

function cloneWithoutOwnStringToken(
  record: Record<string, unknown>
): Record<string, unknown> {
  const out = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const val = record[key];
    if (key === 'token' && typeof val === 'string') continue;
    Object.defineProperty(out, key, {
      configurable: true,
      enumerable: true,
      value: val,
      writable: true,
    });
  }
  return out;
}

function cloneNullProtoRecord(
  record: Record<string, unknown>,
  overrides?: Record<string, unknown>
): Record<string, unknown> {
  const out = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const val =
      overrides && Object.hasOwn(overrides, key) ? overrides[key] : record[key];
    Object.defineProperty(out, key, {
      configurable: true,
      enumerable: true,
      value: val,
      writable: true,
    });
  }
  return out;
}

function stripBetterAuthSessionTokens(
  parsed: unknown,
  mode: BetterAuthResponseMode
): unknown {
  assertSafeJsonDepth(parsed);
  if (parsed === null || typeof parsed !== 'object') return parsed;

  if (mode === 'get-session' && !Array.isArray(parsed)) {
    const root = parsed as Record<string, unknown>;
    const rawSession = Object.hasOwn(root, 'session')
      ? root.session
      : undefined;
    if (
      rawSession &&
      typeof rawSession === 'object' &&
      !Array.isArray(rawSession)
    ) {
      return cloneNullProtoRecord(root, {
        session: cloneWithoutOwnStringToken(
          rawSession as Record<string, unknown>
        ),
      });
    }
    return cloneNullProtoRecord(root);
  }

  if (mode === 'list-sessions') {
    const stripArray = (items: unknown[]) =>
      items.map((entry) =>
        entry && typeof entry === 'object' && !Array.isArray(entry)
          ? cloneWithoutOwnStringToken(entry as Record<string, unknown>)
          : entry
      );
    if (Array.isArray(parsed)) return stripArray(parsed);
    const root = parsed as Record<string, unknown>;
    const overrides = Object.create(null) as Record<string, unknown>;
    if (Object.hasOwn(root, 'sessions') && Array.isArray(root.sessions)) {
      overrides.sessions = stripArray(root.sessions);
    }
    if (Object.hasOwn(root, 'items') && Array.isArray(root.items)) {
      overrides.items = stripArray(root.items);
    }
    return cloneNullProtoRecord(root, overrides);
  }

  return parsed;
}

function collectKnownEnvSecrets(
  envVars: Record<string, string | undefined> | undefined
): string[] {
  if (!envVars) return [];
  const found: string[] = [];
  for (const names of Object.values(ENV_VAR_BY_FAMILY)) {
    for (const base of names) {
      if (envVars[base]) found.push(envVars[base]!);
      for (const env of CLI_ENVS) {
        const scoped = envVars[`${base}_${env.toUpperCase()}`];
        if (scoped) found.push(scoped);
      }
    }
  }
  return found;
}

function unescapeJsonUnicode(text: string): string {
  return text.replace(/\\u([0-9a-fA-F]{4})/gu, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16))
  );
}

function assertNoKnownCredentialPatterns(text: string): void {
  if (KNOWN_CREDENTIAL_PATTERN.test(text)) {
    throw new CliError({
      code: 'CREDENTIAL_LEAK_BLOCKED',
      exitCode: CLI_EXIT.policy,
      message: 'Credential output blocked.',
    });
  }
}

function assertNoSecretJsonKeys(value: unknown, depth = 0): void {
  if (depth > 32) {
    throw new CliError({
      code: 'UPSKII_RESPONSE_TOO_DEEP',
      exitCode: CLI_EXIT.policy,
      message: 'Upskii response JSON nesting exceeded safe depth limit.',
    });
  }
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) assertNoSecretJsonKeys(item, depth + 1);
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (
      SECRET_JSON_KEY_PATTERN.test(key) &&
      entry !== null &&
      entry !== undefined &&
      (typeof entry !== 'string' || entry.trim().length > 0)
    ) {
      throw new CliError({
        code: 'CREDENTIAL_LEAK_BLOCKED',
        exitCode: CLI_EXIT.policy,
        message: 'Credential output blocked.',
      });
    }
    assertNoSecretJsonKeys(entry, depth + 1);
  }
}

function assertSafeTextAndPatterns(
  text: string,
  secrets: readonly (string | undefined | null)[]
): void {
  assertSafeResponseText(text, secrets);
  assertNoKnownCredentialPatterns(text);
  if (text.includes('\\u')) {
    const decoded = unescapeJsonUnicode(text);
    assertSafeResponseText(decoded, secrets);
    assertNoKnownCredentialPatterns(decoded);
  }
}

function assertSafeValueAndPatterns(
  value: unknown,
  secrets: readonly (string | undefined | null)[]
): void {
  if (value === null || value === undefined) return;
  assertSafeParsedValue(value, secrets);
  assertNoSecretJsonKeys(value);
  assertNoKnownCredentialPatterns(JSON.stringify(value));
}

function screenAndProjectD1Telemetry(
  headers: Headers,
  secrets: readonly (string | undefined | null)[]
): Record<string, string> {
  const raw: Record<string, string> = {};
  headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower.startsWith('x-upskii-d1-')) raw[lower] = value;
  });
  if (Object.keys(raw).length > 0) {
    assertSafeTextAndPatterns(JSON.stringify(raw), secrets);
  }
  const safe: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const pattern = SAFE_D1_METRIC_PATTERNS[key];
    if (pattern?.test(value)) {
      safe[key] = value;
    }
  }
  return safe;
}

function assertSafeSseBuffer(
  combined: string,
  secrets: readonly (string | undefined | null)[]
): void {
  assertSafeTextAndPatterns(combined, secrets);
  for (const rawLine of combined.split(/\r?\n/u)) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    const candidate = trimmed.startsWith('data:')
      ? trimmed.slice(5).trim()
      : trimmed;
    if (!candidate) continue;
    assertSafeTextAndPatterns(candidate, secrets);
    if (candidate.startsWith('{') || candidate.startsWith('[')) {
      try {
        const parsed: unknown = JSON.parse(candidate);
        assertSafeValueAndPatterns(parsed, secrets);
      } catch (error) {
        if (error instanceof CliError) throw error;
      }
    }
  }
}

export type UpskiiExperience = 'educator' | 'learn';

export interface UpskiiAuthMaterial {
  bearerToken?: string;
  cookiePair?: string;
}

export interface UpskiiProductClientOptions {
  auth?: UpskiiAuthMaterial;
  env: CliEnv;
  envVars?: Record<string, string | undefined>;
  experience?: UpskiiExperience;
  fetch?: typeof globalThis.fetch;
  origins?: UpskiiOrigins;
  timeoutMs?: number;
}

export interface UpskiiApiResult<T> {
  d1Telemetry: Record<string, string>;
  data: T;
  headers: Headers;
  status: number;
}

export function extractUpskiiD1Telemetry(
  headers: Headers
): Record<string, string> {
  const telemetry: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (key.toLowerCase().startsWith('x-upskii-d1-')) {
      telemetry[key.toLowerCase()] = value;
    }
  });
  return telemetry;
}

export function resolveExperiencePrefix(_experience: UpskiiExperience): string {
  // On app.upskii.com, both Educator and Learn APIs are mounted at /api/upskii;
  // the Upskii gateway routes by the authenticated session's active experience.
  return '/api/upskii';
}

export function rethrowUnavailableEndpoint(
  error: unknown,
  label: string,
  env: CliEnv,
  path: string
): never {
  if (
    error instanceof CliError &&
    (error.code === 'UPSKII_HTTP_404' || error.code === 'UPSKII_HTTP_405')
  ) {
    const status = error.code === 'UPSKII_HTTP_405' ? 405 : 404;
    throw new CliError({
      code: 'UPSKII_ENDPOINT_UNAVAILABLE',
      exitCode: CLI_EXIT.notFound,
      hint: `Upskii endpoint ${path} returned HTTP ${status} on "${env}" (disabled, write-only, or not yet deployed).`,
      message: `${label} is not available on "${env}" (HTTP ${status}).`,
      requestId: error.requestId,
    });
  }
  throw error;
}

export function buildPinnedUrl(origin: string, path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new CliError({
      code: 'INVALID_API_PATH',
      exitCode: CLI_EXIT.usage,
      message: `Expected an absolute API path starting with "/", received "${path}".`,
    });
  }
  const url = new URL(path, origin);
  if (url.origin !== new URL(origin).origin) {
    throw new CliError({
      code: 'ORIGIN_ESCAPE_BLOCKED',
      exitCode: CLI_EXIT.policy,
      message: 'API path escaped its pinned environment origin.',
    });
  }
  return url.toString();
}

export async function readUpskiiCookieFromStorageState(
  filePath: string,
  expectedOrigin: string
): Promise<string> {
  return readCookieFromStorageState(filePath, expectedOrigin);
}

export function buildProductTraceHeaders(
  command: string,
  env: CliEnv,
  reason?: string
): CliTraceHeaders {
  const headers: CliTraceHeaders = {
    'X-TTR-CLI-Version': installedBuildIdentity().version,
    'X-TTR-Command': command,
    'X-TTR-Env': env,
    'X-TTR-Request-Id': crypto.randomUUID(),
  };
  if (reason?.trim()) {
    headers['X-TTR-Reason'] = reason.trim().slice(0, 500);
  }
  return headers;
}

function exitCodeFromStatus(status: number) {
  if (status === 401 || status === 403) return CLI_EXIT.auth;
  if (status === 404) return CLI_EXIT.notFound;
  if (status === 409) return CLI_EXIT.conflict;
  if (status === 429 || status >= 500) return CLI_EXIT.unavailable;
  return CLI_EXIT.usage;
}

export function createUpskiiProductClient(options: UpskiiProductClientOptions) {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const origins = options.origins ?? resolveUpskiiOrigins(options.env);
  const experience: UpskiiExperience = options.experience ?? 'educator';
  const timeoutMs = options.timeoutMs ?? 20_000;
  const auth = options.auth ?? {};

  if (auth.bearerToken && auth.cookiePair) {
    throw new CliError({
      code: 'AUTH_MODE_CONFLICT',
      exitCode: CLI_EXIT.policy,
      message:
        'Cannot combine Upskii Bearer and Cookie auth in the same request.',
    });
  }

  const activeSecrets = [
    auth.bearerToken,
    auth.cookiePair,
    ...collectKnownEnvSecrets(options.envVars ?? process.env),
  ];

  async function requestJson<T>(input: {
    betterAuthResponseMode?: BetterAuthResponseMode;
    body?: unknown;
    command: string;
    discardResponseBody?: boolean;
    extraHeaders?: Record<string, string>;
    extraSecrets?: readonly (string | undefined | null)[];
    fixedErrorMessage?: string;
    method?: string;
    origin?: string;
    path: string;
    reason?: string;
    timeoutMs?: number;
  }): Promise<UpskiiApiResult<T>> {
    const requestSecrets = input.extraSecrets?.length
      ? [...activeSecrets, ...input.extraSecrets]
      : activeSecrets;
    const targetOrigin = input.origin ?? origins.app;
    const url = buildPinnedUrl(targetOrigin, input.path);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...buildProductTraceHeaders(input.command, options.env, input.reason),
      ...input.extraHeaders,
    };
    if (auth.bearerToken) {
      headers.Authorization = `Bearer ${auth.bearerToken}`;
    } else if (auth.cookiePair) {
      headers.Cookie = auth.cookiePair;
      headers.Origin = targetOrigin;
      headers['Sec-Fetch-Site'] = 'same-origin';
    }
    let bodyString: string | undefined;
    if (input.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      bodyString = JSON.stringify(input.body);
    }

    const response = await fetchImpl(url, {
      body: bodyString,
      headers,
      method: input.method ?? 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(input.timeoutMs ?? timeoutMs),
    });

    if (input.discardResponseBody) {
      await response.body?.cancel().catch(() => undefined);
      if (!response.ok) {
        throw new CliError({
          code: `UPSKII_HTTP_${response.status}`,
          exitCode: exitCodeFromStatus(response.status),
          message: `${input.fixedErrorMessage ?? `Upskii request failed (${input.command}).`} (HTTP ${response.status})`,
          requestId: headers['X-TTR-Request-Id'],
        });
      }
      return {
        d1Telemetry: {},
        data: {} as T,
        headers: response.headers,
        status: response.status,
      };
    }

    const text = await response.text();
    const d1Telemetry = screenAndProjectD1Telemetry(
      response.headers,
      requestSecrets
    );

    if (!response.ok) {
      assertSafeTextAndPatterns(text, requestSecrets);
      if (input.fixedErrorMessage) {
        throw new CliError({
          code: `UPSKII_HTTP_${response.status}`,
          exitCode: exitCodeFromStatus(response.status),
          message: `${input.fixedErrorMessage} (HTTP ${response.status})`,
          requestId: headers['X-TTR-Request-Id'],
        });
      }
      let detail = `HTTP ${response.status}`;
      try {
        const parsed = JSON.parse(text) as {
          code?: string;
          error?: string;
          message?: string;
        };
        assertSafeValueAndPatterns(parsed, requestSecrets);
        detail = parsed.error || parsed.message || parsed.code || detail;
      } catch (error) {
        if (error instanceof CliError) throw error;
        // Keep HTTP status message without echoing raw HTML
      }
      assertSafeTextAndPatterns(detail, requestSecrets);
      throw new CliError({
        code: `UPSKII_HTTP_${response.status}`,
        exitCode: exitCodeFromStatus(response.status),
        message: `Upskii request failed (${input.command}): ${detail}`,
        requestId: headers['X-TTR-Request-Id'],
      });
    }

    let data: T;
    if (!text.trim()) {
      data = {} as T;
    } else if (input.betterAuthResponseMode) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        assertSafeTextAndPatterns(text, requestSecrets);
        throw new CliError({
          code: 'UPSKII_INVALID_JSON',
          exitCode: CLI_EXIT.unavailable,
          message: `Upskii returned non-JSON payload for ${input.command}.`,
          requestId: headers['X-TTR-Request-Id'],
        });
      }
      const sanitized = stripBetterAuthSessionTokens(
        parsed,
        input.betterAuthResponseMode
      );
      assertSafeValueAndPatterns(sanitized, requestSecrets);
      assertSafeTextAndPatterns(JSON.stringify(sanitized), requestSecrets);
      data = sanitized as T;
    } else {
      assertSafeTextAndPatterns(text, requestSecrets);
      try {
        data = JSON.parse(text) as T;
      } catch {
        throw new CliError({
          code: 'UPSKII_INVALID_JSON',
          exitCode: CLI_EXIT.unavailable,
          message: `Upskii returned non-JSON payload for ${input.command}.`,
          requestId: headers['X-TTR-Request-Id'],
        });
      }
      assertSafeValueAndPatterns(data, requestSecrets);
    }

    return {
      d1Telemetry,
      data,
      headers: response.headers,
      status: response.status,
    };
  }

  async function requestStream(input: {
    body: unknown;
    command: string;
    path: string;
    timeoutMs?: number;
  }): Promise<{
    chunks: number;
    d1Telemetry: Record<string, string>;
    elapsedMs: number;
    firstChunkMs: number | null;
    preview: string;
    status: number;
  }> {
    const url = buildPinnedUrl(origins.app, input.path);
    const headers: Record<string, string> = {
      Accept: 'text/event-stream, application/json',
      'Content-Type': 'application/json',
      'X-Upskii-AI-Chat-Stream': '1',
      ...buildProductTraceHeaders(input.command, options.env),
    };
    if (auth.bearerToken) {
      headers.Authorization = `Bearer ${auth.bearerToken}`;
    } else if (auth.cookiePair) {
      headers.Cookie = auth.cookiePair;
      headers.Origin = origins.app;
      headers['Sec-Fetch-Site'] = 'same-origin';
    }
    const started = Date.now();
    const response = await fetchImpl(url, {
      body: JSON.stringify(input.body),
      headers,
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(input.timeoutMs ?? 20_000),
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      assertSafeTextAndPatterns(errText, activeSecrets);
      throw new CliError({
        code: `UPSKII_HTTP_${response.status}`,
        exitCode: exitCodeFromStatus(response.status),
        message: `Upskii AI stream failed (HTTP ${response.status}).`,
        requestId: headers['X-TTR-Request-Id'],
      });
    }

    let chunks = 0;
    let firstChunkMs: number | null = null;
    let combined = '';
    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        chunks += 1;
        if (firstChunkMs === null) firstChunkMs = Date.now() - started;
        combined += decoder.decode(next.value, { stream: true });
        if (combined.length > 65_536) {
          await reader.cancel();
          break;
        }
      }
      combined += decoder.decode();
    } else {
      combined = await response.text();
      if (combined) {
        chunks = 1;
        firstChunkMs = Date.now() - started;
      }
    }
    assertSafeSseBuffer(combined, activeSecrets);
    const d1Telemetry = screenAndProjectD1Telemetry(
      response.headers,
      activeSecrets
    );

    return {
      chunks,
      d1Telemetry,
      elapsedMs: Date.now() - started,
      firstChunkMs,
      preview: combined.trim().slice(0, 240),
      status: response.status,
    };
  }

  const apiBase = resolveExperiencePrefix(experience);

  return {
    apiBase,
    experience,
    getActiveSecrets: () => [...activeSecrets],
    origins,
    requestJson,
    requestStream,
    tuturuuuOrigins: resolveTuturuuuOrigins(options.env),
  };
}

export type UpskiiProductClient = ReturnType<typeof createUpskiiProductClient>;
