/**
 * The sign entry's request handler, framework-free so unit tests drive it
 * with in-memory stores. Checks run cheapest first, and nothing reaches a
 * Durable Object before the request HMAC, the body, the permit and the kid
 * binding have passed:
 *
 *   config + floor + environment → HMAC + skew (audience) → body → permit
 *   (audience) → kid binding → fence (DO) → nonce + permit + transaction
 *   claim (DO) → daily budget (DO) → transaction confirmation → fence
 *   again (DO) → permit expiry and HMAC skew again → build and sign.
 *
 * The replay claim comes before the budget, so a replayed request is
 * refused without spending budget; an exhaustion the isolate remembers
 * refuses before the claim, so a flood against an exhausted budget costs no
 * object call. The transaction claim makes signing single-use per
 * transaction even for a caller that can mint fresh permits and nonces; a
 * request refused after its claim (budget, confirmation, fence, freshness)
 * leaves its transaction spent, and the user starts a new sign-in.
 *
 * Replay rows outlive acceptance: a nonce is kept until twice the clock
 * skew past its timestamp, a permit until one skew past its expiry and a
 * transaction for `TRANSACTION_CLAIM_TTL_MS`, so a row never expires while
 * its request could still be accepted.
 *
 * Every response and log line carries a correlation ID and an error code
 * only: no subject, email, names, assertion, header or key material. An
 * unexpected throw anywhere answers the coded `misconfigured`.
 */
import type { SamlSigner } from '@tuturuuu/sso';
import { buildSignedResponse, type SignerFactory } from './build-response';
import type { SignerEnvironment } from './environment';
import type { FenceMode } from './fence-store';
import { type SignInput, signInputSchema } from './input';
import type { KeyMap } from './key-binding';
import { resolveSigningKey } from './key-binding';
import type { Bytes, KeySet } from './key-set';
import { verifyPermit } from './permit';
import type { BudgetPort, ControlPort, ReplayPort } from './ports';
import { TRANSACTION_CLAIM_TTL_MS } from './replay-store';
import { MAX_CLOCK_SKEW_MS, verifyRequestAuth } from './request-auth';
import type { TransactionConfirmation } from './transaction-confirmation';

export const SIGN_PATH = '/v1/saml/sign';
export const MAX_BODY_BYTES = 16_384;

export type SignHandlerDeps = Readonly<{
  now: () => number;
  correlationId: () => string;
  config: () => Readonly<{
    environment: SignerEnvironment | null;
    fenceFloor: FenceMode;
    requestKeys: KeySet | null;
    permitKeys: KeySet | null;
    keyMap: KeyMap | null;
    secret: (name: string) => unknown;
  }>;
  control: ControlPort;
  budget: BudgetPort;
  replay: ReplayPort;
  confirmation: TransactionConfirmation;
  createSigner: SignerFactory;
}>;

const STATUS: Record<string, number> = {
  not_found: 404,
  method_not_allowed: 405,
  payload_too_large: 413,
  unauthenticated: 401,
  invalid_request: 400,
  permit_invalid: 403,
  permit_expired: 403,
  key_binding: 403,
  transaction_unconfirmed: 403,
  replayed: 409,
  protocol: 422,
  budget_exhausted: 429,
  stopped: 503,
  misconfigured: 503,
  unavailable: 503,
  replay_capacity: 503,
  confirmation_unavailable: 503,
  signing_failed: 500,
};

function json(status: number, body: Record<string, unknown>) {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

/** A coded refusal: the error code and the correlation ID, nothing else. */
export function refusal(
  error: string,
  correlationId: string,
  extra: Record<string, unknown> = {}
): Response {
  console.warn('[sso-signer] refused', correlationId, error);
  return json(STATUS[error] ?? 500, { error, correlationId, ...extra });
}

async function readBody(request: Request): Promise<Bytes | null> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (!Number.isFinite(declared) || declared > MAX_BODY_BYTES) return null;
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/** A lone UTF-16 surrogate: a string with no canonical form. */
const LONE_SURROGATE = /\p{Cs}/u;

/**
 * Refuses, at any depth while parsing, a `__proto__` member and any key or
 * string with a lone surrogate (`"\ud800"` is valid JSON but ill-formed
 * Unicode, which the permit's canonical hash cannot encode).
 */
function strictMember(key: string, value: unknown) {
  if (key === '__proto__') throw new SyntaxError('member not allowed');
  if (
    LONE_SURROGATE.test(key) ||
    (typeof value === 'string' && LONE_SURROGATE.test(value))
  ) {
    throw new SyntaxError('ill-formed string');
  }
  return value;
}

/**
 * The body must be exactly `JSON.stringify` of `{ input, permit }`: compact,
 * no duplicate keys at any depth (a duplicate re-serializes shorter), no
 * `__proto__` member and no ill-formed string, so the bytes the HMAC covers
 * and the value checked are one and the same.
 */
function parseBody(body: Bytes): { input: SignInput; permit: unknown } | null {
  let text: string;
  let parsed: unknown;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(body);
    parsed = JSON.parse(text, strictMember);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  if (JSON.stringify(parsed) !== text) return null;
  const keys = Object.keys(parsed);
  if (
    keys.length !== 2 ||
    !keys.includes('input') ||
    !keys.includes('permit')
  ) {
    return null;
  }
  const record = parsed as { input: unknown; permit: unknown };
  const input = signInputSchema.safeParse(record.input);
  return input.success ? { input: input.data, permit: record.permit } : null;
}

/** `SAML_<CODE>` protocol refusals keep their code; anything else is opaque. */
function protocolReason(error: unknown): string | null {
  const message = error instanceof Error ? error.message : '';
  return /^SAML_[A-Z_]{1,40}$/u.test(message) ? message.slice(5) : null;
}

export function createSignHandler(deps: SignHandlerDeps) {
  async function handle(
    request: Request,
    refuse: (error: string, extra?: Record<string, unknown>) => Response,
    correlationId: string
  ): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== SIGN_PATH || url.search !== '') {
      return refuse('not_found');
    }
    if (request.method !== 'POST') return refuse('method_not_allowed');
    const config = deps.config();
    if (config.fenceFloor === 'stopped') return refuse('stopped');
    // No environment: no audience to check and no Durable Object to name.
    const audience = config.environment;
    if (!audience) return refuse('misconfigured');

    const body = await readBody(request);
    if (!body) return refuse('payload_too_large');
    const auth = await verifyRequestAuth({
      audience,
      method: request.method,
      path: url.pathname,
      headers: request.headers,
      body,
      keys: config.requestKeys,
      nowMs: deps.now(),
    });
    if (!auth.ok) return refuse(auth.error);

    const parsed = parseBody(body);
    if (!parsed) return refuse('invalid_request');
    const { input } = parsed;
    const permit = await verifyPermit({
      permit: parsed.permit,
      fields: input,
      keys: config.permitKeys,
      audience,
      nowMs: deps.now(),
    });
    if (!permit.ok) return refuse(permit.error);

    const key = resolveSigningKey({
      keyMap: config.keyMap,
      kid: input.kid,
      client: input.client,
      protocol: input.protocol,
      entityId: input.profile.entityId,
      acsUrl: input.profile.acsUrl,
      secret: config.secret,
    });
    if (!key.ok) return refuse(key.error);

    try {
      if ((await deps.control.fenceMode()) !== 'running') {
        return refuse('stopped');
      }
      // A remembered exhaustion refuses without a claim or an object call.
      const exhausted = deps.budget.peek?.(deps.now());
      if (exhausted && !exhausted.ok) {
        return refuse(exhausted.error, { retryAtMs: exhausted.retryAtMs });
      }
      const nowMs = deps.now();
      const claimed = await deps.replay.claim(
        [
          {
            kind: 'nonce',
            token: auth.nonce,
            expiresAtMs: auth.timestampMs + 2 * MAX_CLOCK_SKEW_MS,
          },
          {
            kind: 'permit',
            token: permit.permit.id,
            expiresAtMs: permit.permit.exp + MAX_CLOCK_SKEW_MS,
          },
          {
            kind: 'transaction',
            token: input.transactionId.toLowerCase(),
            expiresAtMs: nowMs + TRANSACTION_CLAIM_TTL_MS,
          },
        ],
        nowMs
      );
      if (!claimed.ok) return refuse(claimed.error);
      const reserved = await deps.budget.reserve(deps.now());
      if (!reserved.ok) {
        return refuse(reserved.error, { retryAtMs: reserved.retryAtMs });
      }
    } catch {
      return refuse('unavailable');
    }

    let confirmed: Awaited<ReturnType<TransactionConfirmation['confirm']>>;
    try {
      confirmed = await deps.confirmation.confirm(input, {
        fields: permit.permit.fields,
      });
    } catch {
      return refuse('confirmation_unavailable');
    }
    if (!confirmed.ok) return refuse(confirmed.error);

    // A stop during the checks above applies to this request too.
    try {
      if ((await deps.control.fenceMode()) !== 'running') {
        return refuse('stopped');
      }
    } catch {
      return refuse('unavailable');
    }

    // Freshness again, after every await above: the permit and the request
    // HMAC must still be inside their windows when the key is used, however
    // long the objects and the confirmation took.
    const signAtMs = deps.now();
    if (signAtMs >= permit.permit.exp) return refuse('permit_expired');
    if (Math.abs(signAtMs - auth.timestampMs) > MAX_CLOCK_SKEW_MS) {
      return refuse('unauthenticated');
    }

    // The private key is parsed only after every check has passed.
    let signer: SamlSigner;
    try {
      signer = deps.createSigner({
        privateKey: key.privateKey,
        certificate: key.certificate,
      });
    } catch {
      return refuse('misconfigured');
    }

    try {
      const result = await buildSignedResponse(
        input,
        signer,
        key.certificate,
        () => new Date(deps.now())
      );
      console.info('[sso-signer] signed', correlationId);
      return json(200, {
        correlationId,
        responseId: result.responseId,
        assertionId: result.assertionId,
        samlResponse: result.samlResponse,
        destination: result.destination,
        relayState: result.relayState ?? null,
        expiresAt: result.expiresAt,
      });
    } catch (error) {
      const reason = protocolReason(error);
      return reason ? refuse('protocol', { reason }) : refuse('signing_failed');
    }
  }

  return async function signHandler(request: Request): Promise<Response> {
    const correlationId = deps.correlationId();
    const refuse = (error: string, extra: Record<string, unknown> = {}) =>
      refusal(error, correlationId, extra);
    try {
      return await handle(request, refuse, correlationId);
    } catch {
      // Never a raw message: configuration and binding faults are coded.
      return refuse('misconfigured');
    }
  };
}
