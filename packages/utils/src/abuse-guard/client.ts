/**
 * Typed client for the Durable Object abuse-guard store.
 *
 * One attempt per call and no retries. Every transport, auth, stop-fence,
 * timeout or response-shape failure throws `AbuseGuardUnavailableError`;
 * callers keep deciding whether that fails open or closed.
 */
import { hashGuardValue, signGuardRequest } from './crypto';
import {
  ABUSE_GUARD_PROTOCOL_VERSION,
  type AbuseGuardFamily,
  type GuardCommand,
  type GuardErrorCode,
  type GuardResult,
  type GuardRpc,
  type GuardRpcResponse,
  guardRpcResponseSchema,
  guardRpcSchema,
} from './protocol';

export type AbuseGuardFailureCode =
  | GuardErrorCode
  | 'timeout'
  | 'network'
  | 'invalid_response';

export class AbuseGuardUnavailableError extends Error {
  constructor(
    readonly code: AbuseGuardFailureCode,
    message = `Abuse guard store unavailable: ${code}`
  ) {
    super(message);
    this.name = 'AbuseGuardUnavailableError';
  }
}

/** Sends one validated RPC and returns the raw JSON reply. */
export type AbuseGuardTransport = (rpc: GuardRpc) => Promise<unknown>;

export const ABUSE_GUARD_RPC_PATH = '/v1/rpc';

const ERROR_CODES = new Set<GuardErrorCode>([
  'bad_request',
  'unauthorized',
  'guard_stopped',
  'guard_unavailable',
]);

function errorCodeOf(payload: unknown): GuardErrorCode {
  const code =
    payload && typeof payload === 'object' && 'error' in payload
      ? (payload as { error: unknown }).error
      : undefined;
  return ERROR_CODES.has(code as GuardErrorCode)
    ? (code as GuardErrorCode)
    : 'guard_unavailable';
}

function isAbortError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === 'TimeoutError' || error.name === 'AbortError')
  );
}

/** Signed HTTPS transport for Vercel-hosted callers. */
export function createHttpGuardTransport(options: {
  url: string;
  secret: string;
  timeoutMs: number;
  fetch?: typeof fetch;
  now?: () => number;
}): AbuseGuardTransport {
  const endpoint = new URL(ABUSE_GUARD_RPC_PATH, options.url);
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? Date.now;

  return async (rpc) => {
    const body = JSON.stringify(rpc);
    const { timestamp, signature } = await signGuardRequest({
      secret: options.secret,
      method: 'POST',
      path: endpoint.pathname,
      body,
      timestamp: now(),
    });

    let response: Response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        body,
        redirect: 'error',
        headers: {
          'content-type': 'application/json',
          'x-guard-ts': timestamp,
          'x-guard-sig': signature,
        },
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch (error) {
      throw new AbuseGuardUnavailableError(
        isAbortError(error) ? 'timeout' : 'network'
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new AbuseGuardUnavailableError(
        isAbortError(error) ? 'timeout' : 'invalid_response'
      );
    }
    if (!response.ok) {
      throw new AbuseGuardUnavailableError(errorCodeOf(payload));
    }
    return payload;
  };
}

/** Minimal shape of the `AbuseGuardEntrypoint` service binding. */
export interface AbuseGuardBinding {
  run(rpc: GuardRpc): Promise<unknown>;
}

/** Service-binding transport for native Workers; the binding is the trust boundary. */
export function createBindingGuardTransport(
  binding: AbuseGuardBinding,
  timeoutMs: number
): AbuseGuardTransport {
  return async (rpc) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new AbuseGuardUnavailableError('timeout')),
        timeoutMs
      );
    });
    try {
      const payload = await Promise.race([binding.run(rpc), timeout]);
      if (payload && typeof payload === 'object' && 'error' in payload) {
        throw new AbuseGuardUnavailableError(errorCodeOf(payload));
      }
      return payload;
    } catch (error) {
      if (error instanceof AbuseGuardUnavailableError) throw error;
      throw new AbuseGuardUnavailableError('network');
    } finally {
      clearTimeout(timer);
    }
  };
}

export type GuardWindowInput = {
  /** Raw window name inside the subject, e.g. `1m`. Hashed before sending. */
  key: string;
  limit: number;
  windowMs: number;
  algo: 'fixed' | 'sliding';
};

export type GuardWindowSubject = {
  /** Raw subject identity, e.g. `ip:203.0.113.4`. Hashed before sending. */
  partition: string;
  windows: GuardWindowInput[];
};

export type GuardWindowOutcome =
  | { ok: true; remaining: number; resetAt: number }
  | { ok: false; resetAt: number; subjectIndex: number };

export type GuardSetOptions = {
  ttlMs: number;
  mode?: 'always' | 'nx' | 'xx';
  keepTtl?: boolean;
};

export type GuardReservation = {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
};

export interface AbuseGuardClient {
  readonly family: AbuseGuardFamily;
  /** Charges each subject in order; stops at the first denied subject. */
  hitWindows(subjects: GuardWindowSubject[]): Promise<GuardWindowOutcome>;
  get(key: string): Promise<string | null>;
  mget(keys: string[]): Promise<(string | null)[]>;
  set(key: string, value: string, options: GuardSetOptions): Promise<boolean>;
  del(keys: string[]): Promise<number>;
  incr(
    key: string,
    by: number,
    ttlMsOnCreate: number
  ): Promise<{ n: number; ttlMs: number }>;
  expire(key: string, ttlMs: number): Promise<boolean>;
  /** Remaining milliseconds, or -2 when absent. */
  ttl(key: string): Promise<number>;
  /** Atomic multi-budget reservation inside one partition. */
  reserve(input: {
    partition: string;
    budgets: { key: string; limit: number; ttlMs: number }[];
    receipt: string;
  }): Promise<GuardReservation>;
  refund(input: {
    partition: string;
    receipt: string;
    target: string;
  }): Promise<number>;
}

type StepInput = { partition: string; cmds: GuardCommand[] };

function matchesRequest(rpc: GuardRpc, response: GuardRpcResponse) {
  if (response.steps.length !== rpc.steps.length) return false;
  return response.steps.every((step, index) => {
    if ('skipped' in step) return rpc.sequential === true;
    const cmds = rpc.steps[index]?.cmds ?? [];
    return (
      step.results.length === cmds.length &&
      step.results.every((result, at) => result.op === cmds[at]?.op)
    );
  });
}

export function createAbuseGuardClient(options: {
  family: AbuseGuardFamily;
  pepper: string;
  transport: AbuseGuardTransport;
}): AbuseGuardClient {
  const { family, pepper, transport } = options;
  const partitionOf = (raw: string) =>
    hashGuardValue(pepper, `p:${family}`, raw);
  const keyOf = (raw: string) => hashGuardValue(pepper, `k:${family}`, raw);

  async function run(
    steps: StepInput[],
    sequential = false
  ): Promise<(GuardResult[] | null)[]> {
    const rpc: GuardRpc = {
      v: ABUSE_GUARD_PROTOCOL_VERSION,
      family,
      ...(sequential ? { sequential: true } : {}),
      steps: await Promise.all(
        steps.map(async (step) => ({
          p: await partitionOf(step.partition),
          cmds: step.cmds,
        }))
      ),
    };
    if (!guardRpcSchema.safeParse(rpc).success) {
      throw new AbuseGuardUnavailableError('bad_request');
    }
    const parsed = guardRpcResponseSchema.safeParse(await transport(rpc));
    if (!parsed.success || !matchesRequest(rpc, parsed.data)) {
      throw new AbuseGuardUnavailableError('invalid_response');
    }
    return parsed.data.steps.map((step) =>
      'skipped' in step ? null : step.results
    );
  }

  async function single<TOp extends GuardResult['op']>(
    partition: string,
    cmd: GuardCommand & { op: TOp }
  ) {
    const [results] = await run([{ partition, cmds: [cmd] }]);
    return results?.[0] as Extract<GuardResult, { op: TOp }>;
  }

  return {
    family,

    async hitWindows(subjects) {
      const steps = await Promise.all(
        subjects.map(async (subject) => ({
          partition: subject.partition,
          cmds: [
            {
              op: 'win.hit' as const,
              windows: await Promise.all(
                subject.windows.map(async (window) => ({
                  k: await keyOf(window.key),
                  limit: window.limit,
                  windowMs: window.windowMs,
                  algo: window.algo,
                }))
              ),
            },
          ],
        }))
      );
      const results = await run(steps, true);
      let remaining = Number.POSITIVE_INFINITY;
      let resetAt = 0;
      for (const [index, step] of results.entries()) {
        const hit = step?.[0];
        if (hit?.op !== 'win.hit') {
          throw new AbuseGuardUnavailableError('invalid_response');
        }
        if (!hit.ok) {
          return { ok: false, resetAt: hit.resetAt, subjectIndex: index };
        }
        for (const window of hit.windows) {
          remaining = Math.min(remaining, window.remaining);
          resetAt = Math.max(resetAt, window.resetAt);
        }
      }
      return {
        ok: true,
        remaining: Number.isFinite(remaining) ? remaining : 0,
        resetAt,
      };
    },

    async get(key) {
      return (await single(key, { op: 'kv.get', k: await keyOf(key) })).v;
    },

    async mget(keys) {
      if (keys.length === 0) return [];
      const steps = await Promise.all(
        keys.map(async (key) => ({
          partition: key,
          cmds: [{ op: 'kv.get' as const, k: await keyOf(key) }],
        }))
      );
      const results = await run(steps);
      return results.map((step) => {
        const result = step?.[0];
        return result?.op === 'kv.get' ? result.v : null;
      });
    },

    async set(key, value, setOptions) {
      return (
        await single(key, {
          op: 'kv.set',
          k: await keyOf(key),
          v: value,
          ttlMs: setOptions.ttlMs,
          mode: setOptions.mode ?? 'always',
          ...(setOptions.keepTtl ? { keepTtl: true } : {}),
        })
      ).set;
    },

    async del(keys) {
      if (keys.length === 0) return 0;
      const steps = await Promise.all(
        keys.map(async (key) => ({
          partition: key,
          cmds: [{ op: 'kv.del' as const, k: await keyOf(key) }],
        }))
      );
      const results = await run(steps);
      return results.reduce((total, step) => {
        const result = step?.[0];
        return total + (result?.op === 'kv.del' ? result.n : 0);
      }, 0);
    },

    async incr(key, by, ttlMsOnCreate) {
      const result = await single(key, {
        op: 'kv.incr',
        k: await keyOf(key),
        by,
        ttlMsOnCreate,
      });
      return { n: result.n, ttlMs: result.ttlMs };
    },

    async expire(key, ttlMs) {
      return (
        await single(key, { op: 'kv.expire', k: await keyOf(key), ttlMs })
      ).set;
    },

    async ttl(key) {
      return (await single(key, { op: 'kv.ttl', k: await keyOf(key) })).ttlMs;
    },

    async reserve(input) {
      const result = await single(input.partition, {
        op: 'res.reserve',
        budgets: await Promise.all(
          input.budgets.map(async (budget) => ({
            k: await keyOf(budget.key),
            limit: budget.limit,
            ttlMs: budget.ttlMs,
          }))
        ),
        receipt: await keyOf(input.receipt),
      });
      return {
        ok: result.ok,
        remaining: result.remaining,
        retryAfterMs: result.retryAfterMs,
      };
    },

    async refund(input) {
      return (
        await single(input.partition, {
          op: 'res.refund',
          receipt: await keyOf(input.receipt),
          target: await keyOf(input.target),
        })
      ).n;
    },
  };
}
