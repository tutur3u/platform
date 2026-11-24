/**
 * `ControlEntry`: the operator Worker's closed method set over the stop
 * fence. The caller key is checked before any other argument is read; a
 * wrong, missing or malformed key, or an absent auth-side secret, refuses
 * with a uniform `unauthorized` and no Durable Object call. The object checks
 * the key again, because another Worker could bind the `SessionControl`
 * class directly.
 *
 * Runtime-free: `worker.ts` binds these handlers to the Workers runtime.
 */
import type { BackgroundState } from '@tuturuuu/session/control';
import {
  type CallerKeyCheck,
  checkCallerKey,
  parseCallerKeySecret,
} from './caller-key';
import type { FenceRecord } from './fence-store';

export const SESSION_ENVIRONMENTS = ['production', 'staging', 'local'] as const;
export type SessionEnvironment = (typeof SESSION_ENVIRONMENTS)[number];

export function parseSessionEnvironment(
  value: unknown
): SessionEnvironment | null {
  return typeof value === 'string' &&
    (SESSION_ENVIRONMENTS as readonly string[]).includes(value)
    ? (value as SessionEnvironment)
    : null;
}

export type ControlError = 'unauthorized' | 'bad_request' | 'unavailable';

export type ControlResult =
  | Readonly<{ ok: true; fence: FenceRecord; changed: boolean }>
  | Readonly<{ ok: false; error: ControlError }>;

export const UNAUTHORIZED: ControlResult = Object.freeze({
  ok: false,
  error: 'unauthorized',
});
export const UNAVAILABLE: ControlResult = Object.freeze({
  ok: false,
  error: 'unavailable',
});

/** What `SessionControl` exposes to the entry, keyed by the presented key. */
export interface ControlPort {
  readFence(key: string): Promise<ControlResult>;
  setFence(
    key: string,
    mode: unknown,
    reason: unknown,
    actor: unknown
  ): Promise<ControlResult>;
  setBackground(
    key: string,
    background: BackgroundState,
    reason: unknown,
    actor: unknown
  ): Promise<ControlResult>;
}

export type OpPoint = Readonly<{
  category: 'control';
  entry: 'control';
  method: string;
  outcome: 'ok' | 'previous_key' | ControlError;
}>;

export type ControlEntryDeps = Readonly<{
  /** `TTR_SESSION_ENTRY_CONTROL_KEY`, as deployed. */
  secret: unknown;
  /** `TTR_SESSION_ENV`. */
  environment: unknown;
  /** Resolves the environment's `SessionControl`; never called when refused. */
  control: (environment: SessionEnvironment) => ControlPort;
  recordOp: (point: OpPoint) => void;
}>;

type Admitted = Readonly<{
  port: ControlPort;
  key: string;
  check: Extract<CallerKeyCheck, { ok: true }>;
}>;

function admit(
  deps: ControlEntryDeps,
  presented: unknown,
  method: string
): Admitted | ControlResult {
  const check = checkCallerKey(parseCallerKeySecret(deps.secret), presented);
  if (!check.ok) {
    deps.recordOp({
      category: 'control',
      entry: 'control',
      method,
      outcome: 'unauthorized',
    });
    return UNAUTHORIZED;
  }
  const environment = parseSessionEnvironment(deps.environment);
  if (!environment) {
    deps.recordOp({
      category: 'control',
      entry: 'control',
      method,
      outcome: 'unavailable',
    });
    return UNAVAILABLE;
  }
  return { port: deps.control(environment), key: presented as string, check };
}

async function settle(
  deps: ControlEntryDeps,
  admitted: Admitted,
  method: string,
  call: () => Promise<ControlResult>
): Promise<ControlResult> {
  let result: ControlResult;
  try {
    result = await call();
  } catch (error) {
    console.error('[auth] SessionControl call failed', method, error);
    result = UNAVAILABLE;
  }
  // The rotation signal wins over the downstream outcome, so a caller still
  // sending the previous key stays visible even when its calls fail.
  const outcome =
    admitted.check.slot === 'previous'
      ? 'previous_key'
      : result.ok
        ? 'ok'
        : result.error;
  deps.recordOp({ category: 'control', entry: 'control', method, outcome });
  return result;
}

export function createControlEntry(deps: ControlEntryDeps) {
  return Object.freeze({
    async readFence(key: unknown): Promise<ControlResult> {
      const admitted = admit(deps, key, 'readFence');
      if (!('port' in admitted)) return admitted;
      return settle(deps, admitted, 'readFence', () =>
        admitted.port.readFence(admitted.key)
      );
    },

    async setFence(
      key: unknown,
      mode: unknown,
      reason: unknown,
      actor: unknown
    ): Promise<ControlResult> {
      const admitted = admit(deps, key, 'setFence');
      if (!('port' in admitted)) return admitted;
      return settle(deps, admitted, 'setFence', () =>
        admitted.port.setFence(admitted.key, mode, reason, actor)
      );
    },

    async parkBackground(
      key: unknown,
      reason: unknown,
      actor: unknown
    ): Promise<ControlResult> {
      const admitted = admit(deps, key, 'parkBackground');
      if (!('port' in admitted)) return admitted;
      return settle(deps, admitted, 'parkBackground', () =>
        admitted.port.setBackground(admitted.key, 'parked', reason, actor)
      );
    },

    async resumeBackground(
      key: unknown,
      reason: unknown,
      actor: unknown
    ): Promise<ControlResult> {
      const admitted = admit(deps, key, 'resumeBackground');
      if (!('port' in admitted)) return admitted;
      return settle(deps, admitted, 'resumeBackground', () =>
        admitted.port.setBackground(admitted.key, 'running', reason, actor)
      );
    },
  });
}
