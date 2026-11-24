/**
 * The sign entry's request handler, framework-free so unit tests drive it
 * with in-memory stores. Checks run cheapest first, and nothing reaches a
 * Durable Object before the request HMAC, the body, the permit and the kid
 * binding have passed:
 *
 *   floor → HMAC + skew → body → permit → kid binding → fence (DO)
 *   → daily budget (DO) → nonce + permit claim (DO) → transaction
 *   confirmation → build and sign.
 *
 * Every response and log line carries a correlation ID and an error code
 * only: no subject, email, names, assertion or key material.
 */
import type { SamlSigner } from '@tuturuuu/sso';
import { buildSignedResponse, type SignerFactory } from './build-response';
import type { BudgetPort, ControlPort, ReplayPort } from './ports';
import type { FenceMode } from './fence-store';
import { type SignInput, signInputSchema } from './input';
import type { KeyMap } from './key-binding';
import { resolveSigningKey } from './key-binding';
import type { Bytes, KeySet } from './key-set';
import { verifyPermit } from './permit';
import { MAX_CLOCK_SKEW_MS, verifyRequestAuth } from './request-auth';
import type { TransactionConfirmation } from './transaction-confirmation';

export const SIGN_PATH = '/v1/saml/sign';
export const MAX_BODY_BYTES = 16_384;

export type SignHandlerDeps = Readonly<{
  now: () => number;
  correlationId: () => string;
  config: () => Readonly<{
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

function parseBody(body: Bytes): { input: SignInput; permit: unknown } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }
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
  return async function handle(request: Request): Promise<Response> {
    const correlationId = deps.correlationId();
    const refuse = (error: string, extra: Record<string, unknown> = {}) => {
      console.warn('[sso-signer] refused', correlationId, error);
      return json(STATUS[error] ?? 500, { error, correlationId, ...extra });
    };

    const url = new URL(request.url);
    if (url.pathname !== SIGN_PATH || url.search !== '') {
      return refuse('not_found');
    }
    if (request.method !== 'POST') return refuse('method_not_allowed');
    const config = deps.config();
    if (config.fenceFloor === 'stopped') return refuse('stopped');

    const body = await readBody(request);
    if (!body) return refuse('payload_too_large');
    const auth = await verifyRequestAuth({
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
      nowMs: deps.now(),
    });
    if (!permit.ok) return refuse(permit.error);

    const key = resolveSigningKey({
      keyMap: config.keyMap,
      kid: input.kid,
      client: input.client,
      protocol: input.protocol,
      secret: config.secret,
    });
    if (!key.ok) return refuse(key.error);

    try {
      if ((await deps.control.fenceMode()) !== 'running') {
        return refuse('stopped');
      }
      const reserved = await deps.budget.reserve(deps.now());
      if (!reserved.ok) {
        return refuse(reserved.error, { retryAtMs: reserved.retryAtMs });
      }
      const claimed = await deps.replay.claim(
        [
          {
            kind: 'nonce',
            token: auth.nonce,
            expiresAtMs: auth.timestampMs + MAX_CLOCK_SKEW_MS + 1,
          },
          {
            kind: 'permit',
            token: permit.permit.id,
            expiresAtMs: permit.permit.exp,
          },
        ],
        deps.now()
      );
      if (!claimed.ok) return refuse(claimed.error);
    } catch {
      return refuse('unavailable');
    }

    let confirmed: Awaited<ReturnType<TransactionConfirmation['confirm']>>;
    try {
      confirmed = await deps.confirmation.confirm(input);
    } catch {
      return refuse('confirmation_unavailable');
    }
    if (!confirmed.ok) return refuse(confirmed.error);

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
  };
}
