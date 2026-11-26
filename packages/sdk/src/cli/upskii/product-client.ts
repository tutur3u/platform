import { installedBuildIdentity } from '../build-identity';
import { CLI_EXIT, CliError, type CliTraceHeaders } from '../cli-contracts';
import {
  type CliEnv,
  resolveTuturuuuOrigins,
  resolveUpskiiOrigins,
  type UpskiiOrigins,
} from '../cli-env';
import {
  assertSafeParsedValue,
  assertSafeResponseText,
  readCookieFromStorageState,
} from './http';

export type UpskiiExperience = 'educator' | 'learn';

export interface UpskiiAuthMaterial {
  bearerToken?: string;
  cookiePair?: string;
}

export interface UpskiiProductClientOptions {
  auth?: UpskiiAuthMaterial;
  env: CliEnv;
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

export function resolveExperiencePrefix(experience: UpskiiExperience): string {
  return experience === 'learn'
    ? '/workspace/learn/api/upskii'
    : '/workspace/educator/api/upskii';
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

  const activeSecrets = [auth.bearerToken, auth.cookiePair];

  async function requestJson<T>(input: {
    body?: unknown;
    command: string;
    extraHeaders?: Record<string, string>;
    method?: string;
    origin?: string;
    path: string;
    reason?: string;
    timeoutMs?: number;
  }): Promise<UpskiiApiResult<T>> {
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

    const text = await response.text();
    assertSafeResponseText(text, activeSecrets);
    const d1Telemetry = extractUpskiiD1Telemetry(response.headers);
    if (Object.keys(d1Telemetry).length > 0) {
      assertSafeResponseText(JSON.stringify(d1Telemetry), activeSecrets);
    }

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const parsed = JSON.parse(text) as {
          code?: string;
          error?: string;
          message?: string;
        };
        assertSafeParsedValue(parsed, activeSecrets);
        detail = parsed.error || parsed.message || parsed.code || detail;
      } catch (error) {
        if (error instanceof CliError) throw error;
        // Keep HTTP status message without echoing raw HTML
      }
      assertSafeResponseText(detail, activeSecrets);
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
    } else {
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
      assertSafeParsedValue(data, activeSecrets);
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
      assertSafeResponseText(errText, activeSecrets);
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
    assertSafeResponseText(combined, activeSecrets);
    const d1Telemetry = extractUpskiiD1Telemetry(response.headers);
    if (Object.keys(d1Telemetry).length > 0) {
      assertSafeResponseText(JSON.stringify(d1Telemetry), activeSecrets);
    }

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
