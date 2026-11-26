import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import { dirname, parse as parsePath, resolve } from 'node:path';
import { z } from 'zod';
import { installedBuildIdentity } from '../build-identity';
import { CLI_EXIT, CliError, type CliTraceHeaders } from '../cli-contracts';
import type { CliEnv } from '../cli-env';
import { assertNoCredentialLeak } from '../credential-store';
import {
  ensurePrivateDirectory,
  readPrivateJsonFile as readPrivateJsonFileStrict,
  writePrivateFile as writePrivateFileStrict,
} from '../qa-users-secrets';

export const UPSKII_QA_EMAIL_PATTERN =
  /^qa-fleet\+(?:([a-z0-9][a-z0-9-]{3,30})-)?(teacher|student|outsider)@tuturuuu\.com$/u;

export const UPSKII_RUN_LABEL_PATTERN = /^[a-z0-9][a-z0-9-]{3,30}$/u;

export const UPSKII_QA_MARKER_PREFIX = '[QA-E2E ';

const DEFAULT_TIMEOUT_MS = 20_000;
const SESSION_COOKIE_NAME_PATTERN = /^(?:__Secure-)?upskii\.session_token$/u;
const COOKIE_PAIR_PATTERN = /^([^\s=;,]+)=([^\s;,]+)$/u;

let cachedCliVersion: string | undefined;

function getCliVersion(): string {
  if (cachedCliVersion) return cachedCliVersion;
  try {
    cachedCliVersion = installedBuildIdentity().version;
  } catch {
    cachedCliVersion = '0.0.0-dev';
  }
  return cachedCliVersion;
}

export function isUpskiiQaEmail(email: unknown): email is string {
  return typeof email === 'string' && UPSKII_QA_EMAIL_PATTERN.test(email);
}

export function formatQaMarker(runLabel: string, title: string): string {
  if (!UPSKII_RUN_LABEL_PATTERN.test(runLabel)) {
    throw new CliError({
      code: 'INVALID_RUN_LABEL',
      exitCode: CLI_EXIT.usage,
      message: `Invalid run label "${runLabel}". Expected lowercase alphanumeric/hyphen label of 4-31 chars.`,
    });
  }
  return `${UPSKII_QA_MARKER_PREFIX}${runLabel}] ${title}`.slice(0, 120);
}

export function buildUpskiiUrl(origin: string, path: string): string {
  let base: URL;
  try {
    base = new URL(origin);
  } catch {
    throw new CliError({
      code: 'INVALID_ORIGIN',
      exitCode: CLI_EXIT.policy,
      message: `Invalid Upskii origin "${origin}".`,
    });
  }
  if (base.protocol !== 'http:' && base.protocol !== 'https:') {
    throw new CliError({
      code: 'INVALID_ORIGIN',
      exitCode: CLI_EXIT.policy,
      message: `Unsupported Upskii origin protocol "${base.protocol}".`,
    });
  }
  if (
    !path.startsWith('/') ||
    path.startsWith('//') ||
    path.includes('\\') ||
    /[\r\n]/u.test(path)
  ) {
    throw new CliError({
      code: 'CROSS_ORIGIN_ESCAPE',
      exitCode: CLI_EXIT.policy,
      message:
        'Upskii request path must start with "/" and cannot be scheme-relative.',
    });
  }
  const resolved = new URL(path, base.origin);
  if (resolved.origin !== base.origin) {
    throw new CliError({
      code: 'CROSS_ORIGIN_ESCAPE',
      exitCode: CLI_EXIT.policy,
      message: `Upskii path escaped pinned origin "${base.origin}".`,
    });
  }
  return resolved.toString();
}

export function buildTraceHeaders(
  command: string,
  env: CliEnv,
  reason?: string
): CliTraceHeaders {
  const headers: CliTraceHeaders = {
    'X-TTR-CLI-Version': getCliVersion(),
    'X-TTR-Command': command,
    'X-TTR-Env': env,
    'X-TTR-Request-Id': randomUUID(),
  };
  const trimmedReason = reason?.trim();
  if (trimmedReason) {
    headers['X-TTR-Reason'] = trimmedReason;
  }
  return headers;
}

export function assertSafeResponseText(
  text: string,
  secrets: readonly (string | undefined | null)[]
): void {
  assertNoCredentialLeak(text, secrets);
}

export function assertSafeParsedValue(
  value: unknown,
  secrets: readonly (string | undefined | null)[]
): void {
  if (value === null || value === undefined) return;
  assertNoCredentialLeak(JSON.stringify(value), secrets);
}

export interface VerifiedDirectory {
  dev: number;
  ino: number;
  realDir: string;
}

const TRUSTED_ROOT_SYMLINKS = new Set(['/var', '/tmp', '/etc']);

/**
 * Walks the supplied path from root to leaf before directory creation or reads,
 * refusing any symlink except root-owned macOS platform aliases (/var, /tmp, /etc).
 */
export async function assertNoUntrustedPathSymlinks(
  rawPath: string
): Promise<void> {
  const absolute = resolve(rawPath);
  const { root } = parsePath(absolute);
  const sepPattern = process.platform === 'win32' ? /[\\/]+/u : /\/+/u;
  const parts = absolute.slice(root.length).split(sepPattern).filter(Boolean);
  let current = root;
  for (const part of parts) {
    current = resolve(current, part);
    const info = await lstat(current).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (!info) break;
    if (info.isSymbolicLink()) {
      const trustedAlias =
        process.platform === 'darwin' &&
        TRUSTED_ROOT_SYMLINKS.has(current) &&
        info.uid === 0;
      if (!trustedAlias) {
        throw new CliError({
          code: 'UNSAFE_OUTPUT_DIR',
          exitCode: CLI_EXIT.policy,
          message: `Refusing symlink component in path: ${current}`,
        });
      }
    }
  }
}

/**
 * Verifies every ancestor directory from `realDir` to filesystem root is owned by
 * the current user or root and is not group- or world-writable without the sticky bit.
 */
async function assertTrustedDirectoryAncestors(realDir: string): Promise<void> {
  if (typeof process.getuid !== 'function') return;
  const currentUid = process.getuid();
  let current = realDir;
  let reachedRoot = false;
  for (let depth = 0; depth < 64; depth += 1) {
    const info = await lstat(current);
    if (info.isSymbolicLink() || !info.isDirectory()) {
      throw new CliError({
        code: 'UNSAFE_OUTPUT_DIR',
        exitCode: CLI_EXIT.policy,
        message: `Ancestor path must be a real directory: ${current}`,
      });
    }
    const mode = info.mode & 0o7777;
    if (info.uid !== currentUid && info.uid !== 0) {
      throw new CliError({
        code: 'UNSAFE_OUTPUT_DIR',
        exitCode: CLI_EXIT.policy,
        message: `Refusing directory under untrusted owner: ${current}`,
      });
    }
    if ((mode & 0o022) !== 0 && (mode & 0o1000) === 0) {
      throw new CliError({
        code: 'UNSAFE_OUTPUT_DIR',
        exitCode: CLI_EXIT.policy,
        message: `Refusing directory under group/world-writable non-sticky parent: ${current}`,
      });
    }
    const parent = dirname(current);
    if (parent === current) {
      reachedRoot = true;
      break;
    }
    current = parent;
  }
  if (!reachedRoot) {
    throw new CliError({
      code: 'UNSAFE_OUTPUT_DIR',
      exitCode: CLI_EXIT.policy,
      message: `Directory nesting exceeded safe ancestor depth limit: ${realDir}`,
    });
  }
}

export async function captureVerifiedDirectory(
  dirPath: string
): Promise<VerifiedDirectory> {
  await assertNoUntrustedPathSymlinks(dirPath);
  const realDir = await realpath(resolve(dirPath));
  await assertTrustedDirectoryAncestors(realDir);
  const handle = await open(
    realDir,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
  );
  try {
    const info = await handle.stat();
    if (!info.isDirectory()) {
      throw new CliError({
        code: 'UNSAFE_OUTPUT_DIR',
        exitCode: CLI_EXIT.policy,
        message: `Expected a real directory: ${realDir}`,
      });
    }
    if (typeof process.getuid === 'function') {
      if (info.uid !== process.getuid()) {
        throw new CliError({
          code: 'UNSAFE_OUTPUT_DIR',
          exitCode: CLI_EXIT.policy,
          message: `Directory must be owned by current user: ${realDir}`,
        });
      }
      if ((info.mode & 0o077) !== 0) {
        throw new CliError({
          code: 'UNSAFE_OUTPUT_DIR',
          exitCode: CLI_EXIT.policy,
          message: `Directory must be owner-only (0700): ${realDir}`,
        });
      }
    }
    return { dev: info.dev, ino: info.ino, realDir };
  } finally {
    await handle.close();
  }
}

export async function assertVerifiedDirectory(
  anchor: VerifiedDirectory
): Promise<void> {
  const currentReal = await realpath(anchor.realDir);
  if (currentReal !== anchor.realDir) {
    throw new CliError({
      code: 'UNSAFE_OUTPUT_DIR',
      exitCode: CLI_EXIT.policy,
      message: `Directory path changed unexpectedly: ${anchor.realDir}`,
    });
  }
  await assertTrustedDirectoryAncestors(anchor.realDir);
  const handle = await open(
    anchor.realDir,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
  );
  try {
    const info = await handle.stat();
    if (
      !info.isDirectory() ||
      info.dev !== anchor.dev ||
      info.ino !== anchor.ino ||
      (typeof process.getuid === 'function' &&
        (info.uid !== process.getuid() || (info.mode & 0o077) !== 0))
    ) {
      throw new CliError({
        code: 'UNSAFE_OUTPUT_DIR',
        exitCode: CLI_EXIT.policy,
        message: `Directory identity changed during operation: ${anchor.realDir}`,
      });
    }
  } finally {
    await handle.close();
  }
}

export function extractD1Telemetry(headers: Headers): Record<string, string> {
  const telemetry: Record<string, string> = {};
  headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower.startsWith('x-upskii-d1-')) {
      telemetry[lower] = value;
    }
  });
  return telemetry;
}

export interface UpskiiFetchJsonOptions {
  body?: unknown;
  expect?: number[];
  fetch?: typeof globalThis.fetch;
  headers?: Record<string, string>;
  label: string;
  method?: string;
  origin: string;
  path: string;
  secrets?: readonly (string | undefined | null)[];
  timeoutMs?: number;
}

export interface UpskiiFetchJsonResult<T> {
  d1Telemetry: Record<string, string>;
  data: T;
  headers: Headers;
  status: number;
}

function mapHttpStatusToError(status: number): {
  code: string;
  exitCode: (typeof CLI_EXIT)[keyof typeof CLI_EXIT];
} {
  if (status === 401 || status === 403) {
    return { code: 'UPSKII_AUTH_FAILED', exitCode: CLI_EXIT.auth };
  }
  if (status === 404) {
    return { code: 'UPSKII_NOT_FOUND', exitCode: CLI_EXIT.notFound };
  }
  if (status === 409) {
    return { code: 'UPSKII_CONFLICT', exitCode: CLI_EXIT.conflict };
  }
  if (status === 429 || status >= 500) {
    return { code: 'UPSKII_UNAVAILABLE', exitCode: CLI_EXIT.unavailable };
  }
  return { code: 'UPSKII_REQUEST_FAILED', exitCode: CLI_EXIT.usage };
}

function extractSafeErrorDetail(parsed: unknown): string {
  if (!parsed || typeof parsed !== 'object') return '';
  const record = parsed as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof record.code === 'string' && record.code.trim()) {
    parts.push(record.code.trim().slice(0, 60));
  }
  const msg =
    typeof record.error === 'string'
      ? record.error
      : typeof record.message === 'string'
        ? record.message
        : undefined;
  if (msg?.trim()) {
    parts.push(msg.trim().slice(0, 160));
  }
  return parts.length > 0 ? ` (${parts.join(': ')})` : '';
}

export async function upskiiFetchJson<T>(
  options: UpskiiFetchJsonOptions
): Promise<UpskiiFetchJsonResult<T>> {
  const url = buildUpskiiUrl(options.origin, options.path);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const headers: Record<string, string> = {
    accept: 'application/json',
    ...options.headers,
  };
  let body: string | undefined;
  if (options.body !== undefined) {
    headers['content-type'] = headers['content-type'] ?? 'application/json';
    body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetchImpl(url, {
      body,
      cache: 'no-store',
      headers,
      method: options.method ?? 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof CliError) throw error;
    const isTimeout =
      error instanceof Error &&
      (error.name === 'TimeoutError' || error.name === 'AbortError');
    throw new CliError({
      cause: error,
      code: isTimeout ? 'UPSKII_TIMEOUT' : 'UPSKII_NETWORK_ERROR',
      exitCode: CLI_EXIT.unavailable,
      message: `${options.label}: ${isTimeout ? 'request timed out' : 'network or redirect error'}`,
    });
  }

  const secrets = options.secrets ?? [];
  const rawText = await response.text();
  assertSafeResponseText(rawText, secrets);

  const d1Telemetry = extractD1Telemetry(response.headers);
  if (Object.keys(d1Telemetry).length > 0) {
    assertSafeResponseText(JSON.stringify(d1Telemetry), secrets);
  }
  const expect = options.expect ?? [200];
  const contentType = response.headers.get('content-type') ?? '';
  let parsed: unknown = null;

  if (rawText.trim().length > 0) {
    const looksJson =
      contentType.includes('application/json') ||
      rawText.trimStart().startsWith('{') ||
      rawText.trimStart().startsWith('[');
    if (looksJson) {
      try {
        parsed = JSON.parse(rawText);
      } catch (error) {
        if (expect.includes(response.status)) {
          throw new CliError({
            cause: error,
            code: 'UPSKII_INVALID_JSON',
            exitCode: CLI_EXIT.unavailable,
            message: `${options.label}: received invalid JSON response`,
          });
        }
      }
      if (parsed !== null) {
        assertSafeParsedValue(parsed, secrets);
      }
    }
  }

  if (!expect.includes(response.status)) {
    const mapped = mapHttpStatusToError(response.status);
    const requestId =
      response.headers.get('x-qa-request-id') ??
      response.headers.get('x-request-id') ??
      undefined;
    const safeDetail = extractSafeErrorDetail(parsed);
    if (requestId) assertSafeResponseText(requestId, secrets);
    if (safeDetail) assertSafeResponseText(safeDetail, secrets);
    throw new CliError({
      code: mapped.code,
      exitCode: mapped.exitCode,
      message: `${options.label}: HTTP ${response.status}${safeDetail}`,
      requestId,
    });
  }

  return {
    d1Telemetry,
    data: parsed as T,
    headers: response.headers,
    status: response.status,
  };
}

export interface PlaywrightCookie {
  domain: string;
  expires: number;
  httpOnly: boolean;
  name: string;
  path: string;
  sameSite: 'Strict' | 'Lax' | 'None';
  secure: boolean;
  value: string;
}

export interface PlaywrightStorageState {
  cookies: PlaywrightCookie[];
  origins: Array<{
    localStorage: Array<{ name: string; value: string }>;
    origin: string;
  }>;
}

const playwrightStorageStateSchema = z.object({
  cookies: z.array(
    z.object({
      domain: z.string(),
      expires: z.number().optional(),
      httpOnly: z.boolean().optional(),
      name: z.string(),
      path: z.string().optional(),
      sameSite: z.enum(['Strict', 'Lax', 'None']).optional(),
      secure: z.boolean().optional(),
      value: z.string(),
    })
  ),
  origins: z.array(z.unknown()).optional(),
});

export function upskiiCookieToStorageState(
  cookiePair: string,
  appOrigin: string
): PlaywrightStorageState {
  const match = COOKIE_PAIR_PATTERN.exec(cookiePair.trim());
  if (!match?.[1] || !match[2]) {
    throw new CliError({
      code: 'INVALID_SESSION_COOKIE',
      exitCode: CLI_EXIT.auth,
      message: 'Session cookie must be a valid "name=value" pair.',
    });
  }
  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(appOrigin);
  } catch {
    throw new CliError({
      code: 'INVALID_ORIGIN',
      exitCode: CLI_EXIT.policy,
      message: `Invalid Upskii app origin "${appOrigin}".`,
    });
  }
  // Host-only cookie domain binds the session strictly to the target environment host
  // so staging/sandbox/prod cookies never leak across subdomains.
  const domain = parsedOrigin.hostname.toLowerCase();
  const secure =
    parsedOrigin.protocol === 'https:' || match[1].startsWith('__Secure-');

  return {
    cookies: [
      {
        domain,
        expires: -1,
        httpOnly: true,
        name: match[1],
        path: '/',
        sameSite: 'Lax',
        secure,
        value: match[2],
      },
    ],
    origins: [],
  };
}

export async function ensurePrivateDir(dirPath: string): Promise<string> {
  const resolved = resolve(dirPath);
  await assertNoUntrustedPathSymlinks(resolved);
  await ensurePrivateDirectory(resolved);
  return resolved;
}

export async function writePrivateFile(
  filePath: string,
  contents: string
): Promise<string> {
  const target = resolve(filePath);
  const parentDir = dirname(target);
  const parentInfo = await lstat(parentDir).catch(() => undefined);
  if (!parentInfo) {
    await mkdir(parentDir, { mode: 0o700, recursive: true });
  } else if (parentInfo.isSymbolicLink() || !parentInfo.isDirectory()) {
    throw new CliError({
      code: 'UNSAFE_OUTPUT_DIR',
      exitCode: CLI_EXIT.policy,
      message: `Output parent directory must be a real directory: ${parentDir}`,
    });
  }
  return writePrivateFileStrict(target, contents);
}

export async function readPrivateJsonFile(
  filePath: string,
  label: string
): Promise<unknown> {
  const resolved = resolve(filePath);
  await assertNoUntrustedPathSymlinks(resolved);
  const parentReal = await realpath(dirname(resolved)).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new CliError({
        cause: error,
        code: 'FILE_NOT_FOUND',
        exitCode: CLI_EXIT.notFound,
        message: `Missing ${label} file: ${filePath}`,
      });
    }
    throw new CliError({
      cause: error,
      code: 'UNSAFE_OUTPUT_DIR',
      exitCode: CLI_EXIT.policy,
      message: `Failed to verify parent directory for ${label} file: ${filePath}`,
    });
  });
  await assertTrustedDirectoryAncestors(parentReal);
  let parsed: unknown;
  try {
    parsed = await readPrivateJsonFileStrict(resolved);
  } catch (error) {
    throw new CliError({
      cause: error,
      code: 'FILE_UNREADABLE',
      exitCode: CLI_EXIT.policy,
      message: `Failed to securely read ${label} file (must be a non-symlink regular file owned by current user): ${filePath}`,
    });
  }
  if (parsed === undefined) {
    throw new CliError({
      code: 'FILE_NOT_FOUND',
      exitCode: CLI_EXIT.notFound,
      message: `Missing ${label} file: ${filePath}`,
    });
  }
  return parsed;
}

export function cookieDomainMatchesOrigin(
  cookieDomain: string,
  expectedOrigin: string
): boolean {
  const targetHost = new URL(expectedOrigin).hostname.toLowerCase();
  const normalized = cookieDomain.trim().toLowerCase().replace(/^\./u, '');
  if (!normalized) return false;
  if (normalized === 'upskii.com') {
    // Production Upskii browser sessions issue ".upskii.com" cookies for app.upskii.com.
    // Accept upskii.com / .upskii.com ONLY for exact production app.upskii.com — never
    // for apex upskii.com, staging.app.upskii.com, sandbox.app.upskii.com, or any other host.
    return targetHost === 'app.upskii.com';
  }
  return normalized === targetHost;
}

export async function readCookieFromStorageState(
  filePath: string,
  expectedOrigin?: string
): Promise<string> {
  const parsedJson = await readPrivateJsonFile(
    filePath,
    'Playwright storageState'
  );
  const parsed = playwrightStorageStateSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new CliError({
      code: 'INVALID_STORAGE_STATE',
      exitCode: CLI_EXIT.usage,
      message: `Playwright storageState file has an invalid schema: ${filePath}`,
    });
  }
  const cookie = parsed.data.cookies.find(
    (entry) =>
      SESSION_COOKIE_NAME_PATTERN.test(entry.name) &&
      entry.value.length > 0 &&
      !/[\s;,]/u.test(entry.value) &&
      (!expectedOrigin ||
        cookieDomainMatchesOrigin(entry.domain, expectedOrigin))
  );
  if (!cookie) {
    throw new CliError({
      code: 'SESSION_COOKIE_NOT_FOUND',
      exitCode: CLI_EXIT.auth,
      message: expectedOrigin
        ? `No Upskii session cookie matching ${new URL(expectedOrigin).hostname} found in storageState: ${filePath}`
        : `No Upskii session cookie found in storageState: ${filePath}`,
    });
  }
  return `${cookie.name}=${cookie.value}`;
}
