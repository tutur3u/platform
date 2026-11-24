/**
 * `tuturuuu-sso-signer`: the SSO identity provider's signer Worker. It has
 * no public ingress: no routes, no workers.dev and no preview URLs; the
 * default handler answers 404 to everything. Callers reach it only through
 * service bindings to named entry points: `SignerEntry` (HMAC-authenticated
 * `POST /v1/saml/sign`) and `ControlEntry` (the stop fence, behind the
 * control caller key). Deployment is held: no CI workflow publishes it.
 */
import { WorkerEntrypoint } from 'cloudflare:workers';
import { defaultSignerFactory } from './build-response';
import { isControlKey } from './control';
import { createDatabaseConfirmation } from './database-confirmation';
import { parseSignerEnvironment, type SignerEnvironment } from './environment';
import { type FenceMode, parseFenceFloor } from './fence-store';
import { type KeyMap, parseKeyMap } from './key-binding';
import { type KeySet, parseKeySet } from './key-set';
import {
  budgetStub,
  controlStub,
  replayStub,
  type SignerBudget,
  type SignerControl,
  type SignerReplay,
} from './objects';
import { hyperdriveQuery } from './hyperdrive-query';
import { guardPorts } from './ports';
import { createSignHandler, refusal } from './sign-handler';
import {
  selectConfirmation,
  type TransactionConfirmation,
} from './transaction-confirmation';

export { SignerBudget, SignerControl, SignerReplay } from './objects';

export interface Env {
  SIGNER_CONTROL: DurableObjectNamespace<SignerControl>;
  SIGNER_BUDGET: DurableObjectNamespace<SignerBudget>;
  SIGNER_REPLAY: DurableObjectNamespace<SignerReplay>;
  SSO_SIGNER_ENV?: string;
  SSO_SIGNER_FENCE_FLOOR?: string;
  SSO_SIGNER_DAILY_BUDGET?: string;
  SSO_SIGNER_KEYS?: string;
  SSO_SIGNER_PERMIT_PUBLIC_KEY?: string;
  SSO_SIGNER_TRANSACTION_CHECK?: string;
  SSO_SIGNER_REQUEST_KEY?: string;
  SSO_SIGNER_CONTROL_KEY?: string;
  SSO_SIGNER_DB?: Hyperdrive;
}

type Parsed = Readonly<{
  environment: SignerEnvironment | null;
  fenceFloor: FenceMode;
  requestKeys: KeySet | null;
  permitKeys: KeySet | null;
  keyMap: KeyMap | null;
}>;

// Isolate state: parsed configuration, keyed by the raw binding values, and
// the guarded Durable Object ports.
let parsedFor: { raw: string; parsed: Parsed } | null = null;
let guarded: ReturnType<typeof guardPorts> | null = null;

function parsedConfig(env: Env): Parsed {
  const raw = JSON.stringify([
    env.SSO_SIGNER_ENV,
    env.SSO_SIGNER_FENCE_FLOOR,
    env.SSO_SIGNER_REQUEST_KEY,
    env.SSO_SIGNER_PERMIT_PUBLIC_KEY,
    env.SSO_SIGNER_KEYS,
  ]);
  if (parsedFor?.raw !== raw) {
    parsedFor = {
      raw,
      parsed: Object.freeze({
        environment: parseSignerEnvironment(env.SSO_SIGNER_ENV),
        fenceFloor: parseFenceFloor(env.SSO_SIGNER_FENCE_FLOOR),
        requestKeys: parseKeySet(env.SSO_SIGNER_REQUEST_KEY),
        permitKeys: parseKeySet(env.SSO_SIGNER_PERMIT_PUBLIC_KEY),
        keyMap: parseKeyMap(env.SSO_SIGNER_KEYS),
      }),
    };
  }
  return parsedFor.parsed;
}

function ports(env: Env) {
  guarded ??= guardPorts({
    control: { fenceMode: () => controlStub(env).fenceMode() },
    budget: { reserve: () => budgetStub(env).reserve() },
    now: () => Date.now(),
  });
  return guarded;
}

/**
 * The configured transaction check. A build without the confirmation define
 * throws while selecting; that answers the coded `misconfigured`.
 */
function confirmationOf(
  env: Env,
  waitUntil: (promise: Promise<unknown>) => void
): TransactionConfirmation | null {
  const database = env.SSO_SIGNER_DB;
  try {
    return selectConfirmation({
      mode: env.SSO_SIGNER_TRANSACTION_CHECK,
      environment: env.SSO_SIGNER_ENV,
      database: database
        ? () =>
            createDatabaseConfirmation({
              query: hyperdriveQuery(database, waitUntil),
            })
        : null,
    });
  } catch {
    return null;
  }
}

/** The identity provider's entry: build and sign one SAML response. */
export class SignerEntry extends WorkerEntrypoint<Env> {
  fetch(request: Request) {
    const env = this.env;
    const confirmation = confirmationOf(env, (promise) =>
      this.ctx.waitUntil(promise)
    );
    if (!confirmation) {
      return refusal('misconfigured', crypto.randomUUID());
    }
    const guards = ports(env);
    return createSignHandler({
      now: () => Date.now(),
      correlationId: () => crypto.randomUUID(),
      config: () => ({
        ...parsedConfig(env),
        secret: (name) =>
          name.startsWith('SSO_SIGNING_KEY_')
            ? (env as unknown as Record<string, unknown>)[name]
            : undefined,
      }),
      control: guards.control,
      budget: guards.budget,
      replay: { claim: (tokens) => replayStub(env).claim([...tokens]) },
      confirmation,
      createSigner: defaultSignerFactory,
    })(request);
  }
}

const UNAUTHORIZED = Object.freeze({ ok: false, error: 'unauthorized' });
const MISCONFIGURED = Object.freeze({ ok: false, error: 'misconfigured' });
const UNAVAILABLE = Object.freeze({ ok: false, error: 'unavailable' });

/**
 * The operator's entry: read and change the stop fence. The caller key is
 * checked here before any Durable Object call, and again in the object.
 * An unknown `SSO_SIGNER_ENV` answers `misconfigured` and a failed object
 * call `unavailable`; no raw error crosses the binding.
 */
export class ControlEntry extends WorkerEntrypoint<Env> {
  async readFence(key: unknown) {
    if (!isControlKey(this.env.SSO_SIGNER_CONTROL_KEY, key)) {
      return UNAUTHORIZED;
    }
    if (!parseSignerEnvironment(this.env.SSO_SIGNER_ENV)) return MISCONFIGURED;
    try {
      return await controlStub(this.env).readFence(key);
    } catch {
      console.error('[sso-signer] control call failed');
      return UNAVAILABLE;
    }
  }

  async setFence(key: unknown, mode: unknown, reason: unknown) {
    if (!isControlKey(this.env.SSO_SIGNER_CONTROL_KEY, key)) {
      return UNAUTHORIZED;
    }
    if (!parseSignerEnvironment(this.env.SSO_SIGNER_ENV)) return MISCONFIGURED;
    try {
      return await controlStub(this.env).setFence(key, mode, reason);
    } catch {
      console.error('[sso-signer] control call failed');
      return UNAVAILABLE;
    }
  }
}

export default {
  async fetch(): Promise<Response> {
    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
