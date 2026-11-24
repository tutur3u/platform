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
import { guardPorts } from './ports';
import { createSignHandler } from './sign-handler';
import { selectConfirmation } from './transaction-confirmation';

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
}

type Parsed = Readonly<{
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
    env.SSO_SIGNER_FENCE_FLOOR,
    env.SSO_SIGNER_REQUEST_KEY,
    env.SSO_SIGNER_PERMIT_PUBLIC_KEY,
    env.SSO_SIGNER_KEYS,
  ]);
  if (parsedFor?.raw !== raw) {
    parsedFor = {
      raw,
      parsed: Object.freeze({
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

/** The identity provider's entry: build and sign one SAML response. */
export class SignerEntry extends WorkerEntrypoint<Env> {
  fetch(request: Request) {
    const env = this.env;
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
      confirmation: selectConfirmation({
        mode: env.SSO_SIGNER_TRANSACTION_CHECK,
        environment: env.SSO_SIGNER_ENV,
      }),
      createSigner: defaultSignerFactory,
    })(request);
  }
}

const UNAUTHORIZED = Object.freeze({ ok: false, error: 'unauthorized' });

/**
 * The operator's entry: read and change the stop fence. The caller key is
 * checked here before any Durable Object call, and again in the object.
 */
export class ControlEntry extends WorkerEntrypoint<Env> {
  async readFence(key: unknown) {
    if (!isControlKey(this.env.SSO_SIGNER_CONTROL_KEY, key)) {
      return UNAUTHORIZED;
    }
    return controlStub(this.env).readFence(key);
  }

  async setFence(key: unknown, mode: unknown, reason: unknown) {
    if (!isControlKey(this.env.SSO_SIGNER_CONTROL_KEY, key)) {
      return UNAUTHORIZED;
    }
    return controlStub(this.env).setFence(key, mode, reason);
  }
}

export default {
  async fetch(): Promise<Response> {
    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
