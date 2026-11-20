/**
 * Typed client for the Durable Object abuse-guard store.
 *
 * One attempt per call and no retries. Every transport, auth, stop-fence,
 * timeout or response-shape failure throws `AbuseGuardUnavailableError`;
 * callers keep deciding whether that fails open or closed.
 */
import {
  hashGuardValue,
  isStrongGuardSecret,
  resolveGuardOrigin,
  signGuardRequest,
} from './crypto';
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
import type {
  IntegrityCommand,
  IntegrityResult,
} from './native-integrity-protocol';

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

/** Fixed per-family fan-out balances object reuse with independent shard concurrency. */
export const KV_SHARD_COUNT = 64;

const ERROR_CODES = new Set<GuardErrorCode>([
  'bad_request',
  'unauthorized',
  'guard_stopped',
  'guard_limited',
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

/**
 * Signed HTTPS transport for server callers. Throws before anything is
 * signed or sent when the origin is not HTTPS (loopback HTTP excepted).
 */
export function createHttpGuardTransport(options: {
  url: string;
  secret: string;
  timeoutMs: number;
  fetch?: typeof fetch;
  now?: () => number;
}): AbuseGuardTransport {
  const origin = resolveGuardOrigin(options.url);
  if (!origin || !isStrongGuardSecret(options.secret)) {
    throw new AbuseGuardUnavailableError('bad_request');
  }
  const endpoint = new URL(ABUSE_GUARD_RPC_PATH, origin);
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
        redirect: 'manual',
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

    if (
      String(response.type) === 'opaqueredirect' ||
      (response.status >= 300 && response.status < 400)
    ) {
      throw new AbuseGuardUnavailableError('network');
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
  /** Units charged by this hit (default one), e.g. audio seconds. */
  cost?: number;
};

export type GuardWindowSubject = {
  /** Raw subject identity, e.g. `ip:203.0.113.4`. Hashed before sending. */
  partition: string;
  windows: GuardWindowInput[];
};

/** One window's state, in the order the subject listed its windows. */
export type GuardWindowState = { remaining: number; resetAt: number };

export type GuardWindowOutcome =
  | {
      ok: true;
      remaining: number;
      resetAt: number;
      /** Every subject's window states, flattened in request order. */
      windows: GuardWindowState[];
    }
  | {
      ok: false;
      resetAt: number;
      subjectIndex: number;
      /** The denied subject's window states; denied ones report 0 remaining. */
      windows: GuardWindowState[];
    };

/**
 * The client never retries. A caller that retries a mutating call after an
 * unknown outcome (a timeout or network failure) must pass the same
 * `operationId` again; the Worker then returns the original result instead
 * of charging twice. Omit it for single-attempt calls: a fresh id is used.
 */
export type GuardCallOptions = { operationId?: string };

export type GuardSetOptions = GuardCallOptions & {
  ttlMs: number;
  mode?: 'always' | 'nx' | 'xx';
  keepTtl?: boolean;
};

/** Fresh id for a caller that wants to retry one logical operation. */
export function createGuardOperationId() {
  return crypto.randomUUID();
}

export type GuardReservation = {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
};

/** Set only by trusted server adapters, after credential/ingress validation. */
export type GuardFairnessInput = { source: string; principal?: string };

export interface AbuseGuardClient {
  /** A request-scoped view; never mutates a shared client or its identities. */
  withFairness(identity: GuardFairnessInput): AbuseGuardClient;
  readonly family: AbuseGuardFamily;
  /** Charges each subject in order; stops at the first denied subject. */
  hitWindows(
    subjects: GuardWindowSubject[],
    options?: GuardCallOptions
  ): Promise<GuardWindowOutcome>;
  get(key: string): Promise<string | null>;
  mget(keys: string[]): Promise<(string | null)[]>;
  set(key: string, value: string, options: GuardSetOptions): Promise<boolean>;
  del(keys: string[], options?: GuardCallOptions): Promise<number>;
  incr(
    key: string,
    by: number,
    ttlMsOnCreate: number,
    options?: GuardCallOptions
  ): Promise<{ n: number; ttlMs: number }>;
  expire(
    key: string,
    ttlMs: number,
    options?: GuardCallOptions
  ): Promise<boolean>;
  /** Remaining milliseconds, or -2 when absent. */
  ttl(key: string): Promise<number>;
  nativeIntegrity(
    keys: string[],
    command: IntegrityCommand
  ): Promise<IntegrityResult>;
  /** Atomic multi-budget reservation inside one partition. */
  reserve(
    input: GuardCallOptions & {
      partition: string;
      budgets: { key: string; limit: number; ttlMs: number }[];
      receipt: string;
    }
  ): Promise<GuardReservation>;
  refund(
    input: GuardCallOptions & {
      partition: string;
      receipt: string;
      target: string;
    }
  ): Promise<number>;
  /** Atomic Live voice mint admission; `actor`/`budget` are hashed first. */
  liveReserve(input: GuardLiveReserveInput): Promise<GuardLiveReservation>;
}

export type GuardLiveReserveInput = GuardCallOptions & {
  partition: string;
  actor: string;
  budget: string;
  actorLimit: number;
  concurrentLimit: number;
  durationMs: number;
  free: boolean;
  limit: number;
  rate: number;
};

export type GuardLiveReservation = Extract<GuardResult, { op: 'live.reserve' }>;

type StepInput = { partition: string; cmds: GuardCommand[] };

function resultMatches(result: GuardResult, cmd: GuardCommand | undefined) {
  if (!cmd || result.op !== cmd.op) return false;
  // Every window of a hit reports its own state, allowed or denied.
  return result.op === 'win.hit' && cmd.op === 'win.hit'
    ? result.windows.length === cmd.windows.length
    : true;
}

function matchesRequest(rpc: GuardRpc, response: GuardRpcResponse) {
  if (response.steps.length !== rpc.steps.length) return false;
  return response.steps.every((step, index) => {
    if ('skipped' in step) return rpc.sequential === true;
    const cmds = rpc.steps[index]?.cmds ?? [];
    return (
      step.results.length === cmds.length &&
      step.results.every((result, at) => resultMatches(result, cmds[at]))
    );
  });
}

export function createAbuseGuardClient(options: {
  family: AbuseGuardFamily;
  pepper: string;
  transport: AbuseGuardTransport;
  fairness?: GuardFairnessInput;
}): AbuseGuardClient {
  const { family, pepper, transport } = options;
  const fairness = options.fairness ? { ...options.fairness } : undefined;
  const partitionOf = (raw: string) =>
    hashGuardValue(pepper, `p:${family}`, raw);
  const keyOf = (raw: string) => hashGuardValue(pepper, `k:${family}`, raw);
  const shardOf = async (raw: string) => {
    const digest = await hashGuardValue(pepper, `shard:${family}`, raw);
    const bytes = atob(digest.replace(/-/g, '+').replace(/_/g, '/') + '=');
    const prefix = new DataView(
      Uint8Array.from(bytes.slice(0, 4), (byte) => byte.charCodeAt(0)).buffer
    ).getUint32(0);
    return `kv-shard:${prefix % KV_SHARD_COUNT}`;
  };

  async function run(
    steps: StepInput[],
    sequential = false,
    operationId?: string
  ): Promise<(GuardResult[] | null)[]> {
    const rpc: GuardRpc = {
      v: ABUSE_GUARD_PROTOCOL_VERSION,
      id: operationId ?? createGuardOperationId(),
      family,
      ...(fairness
        ? {
            fairness: {
              source: await hashGuardValue(
                pepper,
                `fair:source:${family}`,
                fairness.source
              ),
              ...(fairness.principal
                ? {
                    principal: await hashGuardValue(
                      pepper,
                      `fair:principal:${family}`,
                      fairness.principal
                    ),
                  }
                : {}),
            },
          }
        : {}),
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
    cmd: GuardCommand & { op: TOp },
    operationId?: string
  ) {
    const [results] = await run(
      [{ partition, cmds: [cmd] }],
      false,
      operationId
    );
    return results?.[0] as Extract<GuardResult, { op: TOp }>;
  }

  return {
    family,
    withFairness(identity) {
      return createAbuseGuardClient({ ...options, fairness: identity });
    },

    async hitWindows(subjects, callOptions) {
      const steps = await Promise.all(
        subjects.map(async (subject) => ({
          partition: await shardOf(subject.partition),
          cmds: [
            {
              op: 'win.hit' as const,
              windows: await Promise.all(
                subject.windows.map(async (window) => ({
                  // A shard contains many subjects; window identity includes its owner.
                  k: await keyOf(
                    JSON.stringify([subject.partition, window.key])
                  ),
                  limit: window.limit,
                  windowMs: window.windowMs,
                  algo: window.algo,
                  ...(window.cost === undefined ? {} : { cost: window.cost }),
                }))
              ),
            },
          ],
        }))
      );
      const results = await run(steps, true, callOptions?.operationId);
      let remaining = Number.POSITIVE_INFINITY;
      let resetAt = 0;
      const windows: GuardWindowState[] = [];
      for (const [index, step] of results.entries()) {
        const hit = step?.[0];
        if (hit?.op !== 'win.hit') {
          throw new AbuseGuardUnavailableError('invalid_response');
        }
        if (!hit.ok) {
          return {
            ok: false,
            resetAt: hit.resetAt,
            subjectIndex: index,
            windows: hit.windows,
          };
        }
        for (const window of hit.windows) {
          remaining = Math.min(remaining, window.remaining);
          resetAt = Math.max(resetAt, window.resetAt);
          windows.push(window);
        }
      }
      return {
        ok: true,
        remaining: Number.isFinite(remaining) ? remaining : 0,
        resetAt,
        windows,
      };
    },

    async get(key) {
      return (
        await single(await shardOf(key), { op: 'kv.get', k: await keyOf(key) })
      ).v;
    },

    async mget(keys) {
      if (keys.length === 0) return [];
      const steps = await Promise.all(
        keys.map(async (key) => ({
          partition: await shardOf(key),
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
        await single(
          await shardOf(key),
          {
            op: 'kv.set',
            k: await keyOf(key),
            v: value,
            ttlMs: setOptions.ttlMs,
            mode: setOptions.mode ?? 'always',
            ...(setOptions.keepTtl ? { keepTtl: true } : {}),
          },
          setOptions.operationId
        )
      ).set;
    },

    async del(keys, callOptions) {
      if (keys.length === 0) return 0;
      const steps = await Promise.all(
        keys.map(async (key) => ({
          partition: await shardOf(key),
          cmds: [{ op: 'kv.del' as const, k: await keyOf(key) }],
        }))
      );
      const results = await run(steps, false, callOptions?.operationId);
      return results.reduce((total, step) => {
        const result = step?.[0];
        return total + (result?.op === 'kv.del' ? result.n : 0);
      }, 0);
    },

    async incr(key, by, ttlMsOnCreate, callOptions) {
      const result = await single(
        await shardOf(key),
        { op: 'kv.incr', k: await keyOf(key), by, ttlMsOnCreate },
        callOptions?.operationId
      );
      return { n: result.n, ttlMs: result.ttlMs };
    },

    async expire(key, ttlMs, callOptions) {
      return (
        await single(
          await shardOf(key),
          { op: 'kv.expire', k: await keyOf(key), ttlMs },
          callOptions?.operationId
        )
      ).set;
    },

    async ttl(key) {
      return (
        await single(await shardOf(key), { op: 'kv.ttl', k: await keyOf(key) })
      ).ttlMs;
    },

    async nativeIntegrity(keys, command) {
      const result = await single('native-integrity:v1', {
        op: 'integrity.atomic',
        keys: await Promise.all(keys.map(keyOf)),
        command,
      });
      return result.value;
    },

    async reserve(input) {
      const result = await single(
        input.partition,
        {
          op: 'res.reserve',
          budgets: await Promise.all(
            input.budgets.map(async (budget) => ({
              k: await keyOf(budget.key),
              limit: budget.limit,
              ttlMs: budget.ttlMs,
            }))
          ),
          receipt: await keyOf(input.receipt),
        },
        input.operationId
      );
      return {
        ok: result.ok,
        remaining: result.remaining,
        retryAfterMs: result.retryAfterMs,
      };
    },

    async refund(input) {
      return (
        await single(
          input.partition,
          {
            op: 'res.refund',
            receipt: await keyOf(input.receipt),
            target: await keyOf(input.target),
          },
          input.operationId
        )
      ).n;
    },

    async liveReserve({ partition, operationId, actor, budget, ...limits }) {
      return single(
        partition,
        {
          op: 'live.reserve',
          actor: await keyOf(actor),
          budget: await keyOf(budget),
          ...limits,
        },
        operationId
      );
    },
  };
}
