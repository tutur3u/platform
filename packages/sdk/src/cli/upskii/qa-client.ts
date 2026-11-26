import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CLI_EXIT, CliError } from '../cli-contracts';
import {
  type CliEnv,
  resolveUpskiiOrigins,
  type UpskiiOrigins,
} from '../cli-env';
import {
  assertSafeResponseText,
  buildTraceHeaders,
  buildUpskiiUrl,
  isUpskiiQaEmail,
  type PlaywrightStorageState,
  UPSKII_RUN_LABEL_PATTERN,
  upskiiCookieToStorageState,
  upskiiFetchJson,
} from './http';

export const UPSKII_QA_ROLES = ['teacher', 'student', 'outsider'] as const;
export type UpskiiQaRole = (typeof UPSKII_QA_ROLES)[number];

export const UPSKII_QA_PURGE_MODES = ['dry-run', 'apply', 'verify'] as const;
export type UpskiiQaPurgeMode = (typeof UPSKII_QA_PURGE_MODES)[number];

export interface UpskiiQaIdentity {
  createdAt?: string | null;
  disabledAt?: string | null;
  email: string;
  expiresAt?: string | null;
  password?: string;
  role: UpskiiQaRole;
  runLabel?: string;
  state?: string;
  userId: string;
}

export interface UpskiiQaPurgeResult {
  counts: Record<string, number>;
  more?: boolean;
  purge?: {
    clean?: boolean;
    identity?: string;
  };
}

export interface UpskiiQaListPage {
  more: boolean;
  nextCursor?: string;
  users: UpskiiQaIdentity[];
}

export interface UpskiiQaSeedClassResult {
  classId: string;
  outcome: string;
  userId: string;
}

const QA_BASE_PATH = '/api/admin/qa/users';
const MIN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 7200;
const DEFAULT_SIGN_IN_TIMEOUT_MS = 20_000;
const SESSION_COOKIE_PAIR_PATTERN =
  /^(?:__Secure-)?upskii\.session_token=[^\s;,]+$/u;
export const SAFE_QA_ID_PATTERN =
  /^(?!\.{1,2}$)[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

const qaRoleSchema = z.enum(UPSKII_QA_ROLES);
const qaPurgeModeSchema = z.enum(UPSKII_QA_PURGE_MODES);

const qaIdentitySchema = z.object({
  createdAt: z.string().nullable().optional(),
  disabledAt: z.string().nullable().optional(),
  email: z.string(),
  expiresAt: z.string().nullable().optional(),
  password: z.string().optional(),
  role: qaRoleSchema,
  runLabel: z.string().optional(),
  state: z.string().optional(),
  userId: z.string().regex(SAFE_QA_ID_PATTERN),
});

const qaPurgeResultSchema = z.object({
  counts: z.record(z.string(), z.number()).default({}),
  more: z.boolean().optional(),
  purge: z
    .object({
      clean: z.boolean().optional(),
      identity: z.string().optional(),
    })
    .optional(),
});

const qaListPageSchema = z.object({
  more: z.boolean().optional(),
  nextCursor: z.string().nullable().optional(),
  users: z.array(z.unknown()).optional(),
});

function parseQaIdentity(raw: unknown, label: string): UpskiiQaIdentity {
  const candidate =
    raw && typeof raw === 'object' && 'user' in raw
      ? (raw as { user?: unknown }).user
      : raw;
  const parsed = qaIdentitySchema.safeParse(candidate);
  if (!parsed.success) {
    throw new CliError({
      code: 'UPSKII_INVALID_IDENTITY',
      exitCode: CLI_EXIT.unavailable,
      message: `${label}: provisioner returned an invalid QA identity payload.`,
    });
  }
  if (!isUpskiiQaEmail(parsed.data.email)) {
    throw new CliError({
      code: 'NON_QA_EMAIL_RETURNED',
      exitCode: CLI_EXIT.policy,
      message: `${label}: provisioner returned a non-QA email address.`,
    });
  }
  return parsed.data;
}

function assertValidUserId(userId: string): string {
  const trimmed = userId.trim();
  if (!trimmed || trimmed.includes('/') || trimmed.includes('..')) {
    throw new CliError({
      code: 'INVALID_USER_ID',
      exitCode: CLI_EXIT.usage,
      message: `Invalid Upskii QA userId "${userId}".`,
    });
  }
  return trimmed;
}

export interface CreateUpskiiQaClientOptions {
  command?: string;
  env: CliEnv;
  fetch?: typeof globalThis.fetch;
  origins?: UpskiiOrigins;
  reason?: string;
  token: string;
}

export function createUpskiiQaClient(options: CreateUpskiiQaClientOptions) {
  if (!options.token.trim()) {
    throw new CliError({
      code: 'UPSKII_QA_TOKEN_MISSING',
      exitCode: CLI_EXIT.auth,
      message: 'Upskii QA provisioner token is required.',
    });
  }

  const origins = options.origins ?? resolveUpskiiOrigins(options.env);
  const command = options.command ?? 'external upskii qa';

  function baseHeaders(extra?: Record<string, string>): Record<string, string> {
    const trace = buildTraceHeaders(command, options.env, options.reason);
    const merged: Record<string, string> = {
      authorization: `Bearer ${options.token}`,
      'X-TTR-CLI-Version': trace['X-TTR-CLI-Version'],
      'X-TTR-Command': trace['X-TTR-Command'],
      'X-TTR-Env': trace['X-TTR-Env'],
      'X-TTR-Request-Id': trace['X-TTR-Request-Id'],
    };
    if (trace['X-TTR-Reason']) {
      merged['X-TTR-Reason'] = trace['X-TTR-Reason'];
    }
    return { ...merged, ...extra };
  }

  return {
    origins,

    async create(input: {
      requestId?: string;
      role: UpskiiQaRole;
      runLabel: string;
      ttlSeconds: number;
    }): Promise<UpskiiQaIdentity> {
      if (!UPSKII_RUN_LABEL_PATTERN.test(input.runLabel)) {
        throw new CliError({
          code: 'INVALID_RUN_LABEL',
          exitCode: CLI_EXIT.usage,
          message: `Invalid run label "${input.runLabel}". Expected /^[a-z0-9][a-z0-9-]{3,30}$/.`,
        });
      }
      if (!qaRoleSchema.safeParse(input.role).success) {
        throw new CliError({
          code: 'INVALID_QA_ROLE',
          exitCode: CLI_EXIT.usage,
          message: `Invalid QA role "${String(input.role)}". Expected teacher, student, or outsider.`,
        });
      }
      if (
        !Number.isInteger(input.ttlSeconds) ||
        input.ttlSeconds < MIN_TTL_SECONDS ||
        input.ttlSeconds > MAX_TTL_SECONDS
      ) {
        throw new CliError({
          code: 'INVALID_TTL',
          exitCode: CLI_EXIT.usage,
          message: `TTL must be an integer between ${MIN_TTL_SECONDS} and ${MAX_TTL_SECONDS} seconds.`,
        });
      }

      const { data } = await upskiiFetchJson<unknown>({
        body: {
          requestId: input.requestId ?? randomUUID(),
          role: input.role,
          runLabel: input.runLabel,
          ttlSeconds: input.ttlSeconds,
        },
        expect: [200, 201],
        fetch: options.fetch,
        headers: baseHeaders(),
        label: 'upskii qa create',
        method: 'POST',
        origin: origins.admin,
        path: QA_BASE_PATH,
        secrets: [options.token],
      });
      return parseQaIdentity(data, 'upskii qa create');
    },

    async list(
      filter: {
        cursor?: string;
        runLabel?: string;
        state?: 'active' | 'expired';
      } = {}
    ): Promise<UpskiiQaListPage> {
      const query = new URLSearchParams();
      if (filter.runLabel) {
        if (!UPSKII_RUN_LABEL_PATTERN.test(filter.runLabel)) {
          throw new CliError({
            code: 'INVALID_RUN_LABEL',
            exitCode: CLI_EXIT.usage,
            message: `Invalid run label "${filter.runLabel}".`,
          });
        }
        query.set('runLabel', filter.runLabel);
      }
      if (filter.state) {
        query.set('state', filter.state);
      }
      if (filter.cursor) {
        query.set('cursor', filter.cursor);
      }
      const suffix = query.toString();
      const path = suffix ? `${QA_BASE_PATH}?${suffix}` : QA_BASE_PATH;

      const { data } = await upskiiFetchJson<unknown>({
        expect: [200],
        fetch: options.fetch,
        headers: baseHeaders({ 'x-qa-request-id': randomUUID() }),
        label: 'upskii qa list',
        method: 'GET',
        origin: origins.admin,
        path,
        secrets: [options.token],
      });

      const parsed = qaListPageSchema.safeParse(data);
      if (!parsed.success) {
        throw new CliError({
          code: 'UPSKII_INVALID_LIST_RESPONSE',
          exitCode: CLI_EXIT.unavailable,
          message: 'upskii qa list: provisioner returned an invalid page.',
        });
      }

      const users: UpskiiQaIdentity[] = [];
      for (const item of parsed.data.users ?? []) {
        const parsedItem = qaIdentitySchema.safeParse(item);
        if (parsedItem.success && isUpskiiQaEmail(parsedItem.data.email)) {
          users.push(parsedItem.data);
        }
      }

      return {
        more: parsed.data.more === true,
        nextCursor: parsed.data.nextCursor ?? undefined,
        users,
      };
    },

    async get(userId: string): Promise<UpskiiQaIdentity> {
      const safeId = assertValidUserId(userId);
      const { data } = await upskiiFetchJson<unknown>({
        expect: [200],
        fetch: options.fetch,
        headers: baseHeaders({ 'x-qa-request-id': randomUUID() }),
        label: 'upskii qa get',
        method: 'GET',
        origin: origins.admin,
        path: `${QA_BASE_PATH}/${encodeURIComponent(safeId)}`,
        secrets: [options.token],
      });
      return parseQaIdentity(data, 'upskii qa get');
    },

    async setPassword(
      userId: string,
      password: string
    ): Promise<{ updated: true; userId: string }> {
      const safeId = assertValidUserId(userId);
      if (!password) {
        throw new CliError({
          code: 'MISSING_PASSWORD',
          exitCode: CLI_EXIT.usage,
          message: 'Password must not be empty.',
        });
      }
      await upskiiFetchJson<unknown>({
        body: {
          password,
          requestId: randomUUID(),
        },
        expect: [200, 204],
        fetch: options.fetch,
        headers: baseHeaders(),
        label: 'upskii qa set-password',
        method: 'PUT',
        origin: origins.admin,
        path: `${QA_BASE_PATH}/${encodeURIComponent(safeId)}`,
        secrets: [options.token, password],
      });
      return { updated: true, userId: safeId };
    },

    async seedClass(userId: string): Promise<UpskiiQaSeedClassResult> {
      const safeId = assertValidUserId(userId);
      const { data } = await upskiiFetchJson<unknown>({
        body: { requestId: randomUUID() },
        expect: [200, 201],
        fetch: options.fetch,
        headers: baseHeaders(),
        label: 'upskii qa seed-class',
        method: 'POST',
        origin: origins.admin,
        path: `${QA_BASE_PATH}/${encodeURIComponent(safeId)}`,
        secrets: [options.token],
      });
      const parsed = z
        .object({
          classId: z.string().regex(SAFE_QA_ID_PATTERN),
          outcome: z.string().optional(),
          userId: z.string().regex(SAFE_QA_ID_PATTERN).optional(),
        })
        .safeParse(data);
      if (!parsed.success) {
        throw new CliError({
          code: 'UPSKII_SEED_CLASS_INVALID',
          exitCode: CLI_EXIT.unavailable,
          message: 'upskii qa seed-class: provisioner returned no classId.',
        });
      }
      return {
        classId: parsed.data.classId,
        outcome: parsed.data.outcome ?? 'seeded',
        userId: parsed.data.userId ?? safeId,
      };
    },

    async disable(
      userId: string
    ): Promise<{ disabled: true; outcome: string; userId: string }> {
      const safeId = assertValidUserId(userId);
      const { data } = await upskiiFetchJson<unknown>({
        expect: [200, 204],
        fetch: options.fetch,
        headers: baseHeaders({ 'x-qa-request-id': randomUUID() }),
        label: 'upskii qa disable',
        method: 'DELETE',
        origin: origins.admin,
        path: `${QA_BASE_PATH}/${encodeURIComponent(safeId)}`,
        secrets: [options.token],
      });
      const outcome =
        data &&
        typeof data === 'object' &&
        'outcome' in data &&
        typeof (data as { outcome?: unknown }).outcome === 'string'
          ? (data as { outcome: string }).outcome
          : 'disabled';
      return { disabled: true, outcome, userId: safeId };
    },

    async purge(
      userId: string,
      mode: UpskiiQaPurgeMode
    ): Promise<UpskiiQaPurgeResult> {
      const safeId = assertValidUserId(userId);
      if (!qaPurgeModeSchema.safeParse(mode).success) {
        throw new CliError({
          code: 'INVALID_PURGE_MODE',
          exitCode: CLI_EXIT.usage,
          message: `Invalid purge mode "${String(mode)}". Expected dry-run, apply, or verify.`,
        });
      }
      const { data } = await upskiiFetchJson<unknown>({
        body: { mode, requestId: randomUUID() },
        expect: [200],
        fetch: options.fetch,
        headers: baseHeaders(),
        label: `upskii qa purge ${mode}`,
        method: 'POST',
        origin: origins.admin,
        path: `${QA_BASE_PATH}/${encodeURIComponent(safeId)}/purge`,
        secrets: [options.token],
      });
      const parsed = qaPurgeResultSchema.safeParse(data);
      if (!parsed.success) {
        throw new CliError({
          code: 'UPSKII_INVALID_PURGE_RESPONSE',
          exitCode: CLI_EXIT.unavailable,
          message: `upskii qa purge ${mode}: provisioner returned an invalid payload.`,
        });
      }
      return parsed.data;
    },
  };
}

export type UpskiiQaClient = ReturnType<typeof createUpskiiQaClient>;

function readSetCookieHeaders(headers: Headers): string[] {
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }
  const single = headers.get('set-cookie');
  return single ? [single] : [];
}

export interface UpskiiPasswordSignInOptions {
  email: string;
  fetch?: typeof globalThis.fetch;
  origins: UpskiiOrigins;
  password: string;
  role: UpskiiQaRole;
  timeoutMs?: number;
}

export async function upskiiPasswordSignIn(
  options: UpskiiPasswordSignInOptions
): Promise<{ cookiePair: string; storageState: PlaywrightStorageState }> {
  if (!isUpskiiQaEmail(options.email)) {
    throw new CliError({
      code: 'NON_QA_EMAIL_REFUSED',
      exitCode: CLI_EXIT.policy,
      message: 'Password sign-in helper only accepts Upskii QA fleet emails.',
    });
  }
  if (!options.password) {
    throw new CliError({
      code: 'MISSING_PASSWORD',
      exitCode: CLI_EXIT.auth,
      message: 'Upskii QA identity has no password for sign-in.',
    });
  }

  const fetchImpl = options.fetch ?? globalThis.fetch;
  const url = buildUpskiiUrl(options.origins.auth, '/api/auth/password');
  const intent = options.role === 'teacher' ? 'teacher' : 'student';

  let response: Response;
  try {
    response = await fetchImpl(url, {
      body: new URLSearchParams({
        email: options.email,
        intent,
        password: options.password,
        returnTo: `${options.origins.app}/`,
      }),
      cache: 'no-store',
      headers: {
        origin: options.origins.app,
        'sec-fetch-site': 'same-site',
      },
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(
        options.timeoutMs ?? DEFAULT_SIGN_IN_TIMEOUT_MS
      ),
    });
  } catch (error) {
    const isTimeout =
      error instanceof Error &&
      (error.name === 'TimeoutError' || error.name === 'AbortError');
    throw new CliError({
      cause: error,
      code: isTimeout ? 'UPSKII_TIMEOUT' : 'UPSKII_NETWORK_ERROR',
      exitCode: CLI_EXIT.unavailable,
      message: `upskii password sign-in: ${isTimeout ? 'request timed out' : 'network error'}`,
    });
  }

  if (response.status !== 303) {
    const bodyText = await response.text().catch(() => '');
    assertSafeResponseText(bodyText, [options.password]);
    throw new CliError({
      code: 'UPSKII_SIGN_IN_FAILED',
      exitCode:
        response.status >= 500 || response.status === 429
          ? CLI_EXIT.unavailable
          : CLI_EXIT.auth,
      message: `Upskii password sign-in failed with HTTP ${response.status}.`,
    });
  }

  await response.body?.cancel();
  const cookiePair = readSetCookieHeaders(response.headers)
    .map((header) => header.split(';', 1)[0]?.trim() ?? '')
    .find((pair) => SESSION_COOKIE_PAIR_PATTERN.test(pair));

  if (!cookiePair) {
    throw new CliError({
      code: 'UPSKII_SESSION_MISSING',
      exitCode: CLI_EXIT.auth,
      message: 'Upskii sign-in succeeded without issuing a session cookie.',
    });
  }

  return {
    cookiePair,
    storageState: upskiiCookieToStorageState(cookiePair, options.origins.app),
  };
}
