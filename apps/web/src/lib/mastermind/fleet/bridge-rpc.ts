import 'server-only';

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { MastermindBridgeError } from '@tuturuuu/utils/mastermind-store/bridge-client';
import {
  BRIDGE_LIMITS,
  BRIDGE_RPC_KEY_INFO,
  type BridgeRpcKind,
  type BridgeRpcRequest,
  bridgeRpcAnswerSchemas,
  bridgeRpcArgsSchemas,
  bridgeRpcFailureCodes,
  bridgeRpcSealContext,
  bridgeRpcSigningString,
} from '@tuturuuu/utils/mastermind-store/bridge-protocol';
import type { z } from 'zod';
import { derive, fleetBridge, fleetSecret } from './bridge';

export type FleetReadError =
  | (typeof bridgeRpcFailureCodes)[number]
  | 'offline'
  | 'timeout'
  | 'rate_limited'
  | 'unconfigured'
  | 'invalid_answer';

export type FleetRead<K extends BridgeRpcKind> =
  | { ok: true; data: z.output<(typeof bridgeRpcAnswerSchemas)[K]> }
  | { ok: false; error: FleetReadError };

const BRIDGE_READ_ERRORS: Partial<
  Record<MastermindBridgeError['code'], FleetReadError>
> = {
  offline: 'offline',
  timeout: 'timeout',
  rate_limited: 'rate_limited',
  budget: 'rate_limited',
};

/**
 * Asks the machine for one read (its linked machines, a page of threads, a
 * page of a thread's history). The arguments go out sealed and signed, the
 * answer comes back sealed, both under keys derived from the fleet secret:
 * the store Worker in between relays ciphertext it has no key for, and
 * stores none of it. An answer that does not open, or does not fit the
 * closed shape for its kind, is refused rather than passed on.
 */
export async function readFromMachine<K extends BridgeRpcKind>(
  kind: K,
  machineId: string,
  args: z.input<(typeof bridgeRpcArgsSchemas)[K]>,
  env: Record<string, string | undefined> = process.env
): Promise<FleetRead<K>> {
  const secret = fleetSecret(env);
  const bridge = fleetBridge(env);
  if (!secret || !bridge) return { ok: false, error: 'unconfigured' };
  const parsedArgs = bridgeRpcArgsSchemas[kind].safeParse(args);
  if (!parsedArgs.success) return { ok: false, error: 'bad_request' };

  const key = derive(secret, BRIDGE_RPC_KEY_INFO);
  const id = randomUUID();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(bridgeRpcSealContext('req', id, machineId)));
  const sealed = Buffer.concat([
    cipher.update(JSON.stringify(parsedArgs.data), 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  const now = Date.now();
  const request: BridgeRpcRequest = {
    id,
    machineId,
    kind,
    box: { iv: iv.toString('base64url'), data: sealed.toString('base64url') },
    issuedAt: now,
    expiresAt: now + BRIDGE_LIMITS.rpcLifetimeMs,
  };

  let box: { iv: string; data: string };
  try {
    box = await bridge.rpc({
      request,
      sig: createHmac('sha256', secret)
        .update(bridgeRpcSigningString(request), 'utf8')
        .digest('hex'),
    });
  } catch (error) {
    const code = error instanceof MastermindBridgeError ? error.code : null;
    const mapped = code ? BRIDGE_READ_ERRORS[code] : undefined;
    if (!mapped) console.warn('Mastermind bridge read failed', { code });
    return { ok: false, error: mapped ?? 'unconfigured' };
  }

  let answer: unknown;
  try {
    const data = Buffer.from(box.data, 'base64url');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(box.iv, 'base64url')
    );
    decipher.setAAD(Buffer.from(bridgeRpcSealContext('res', id, machineId)));
    decipher.setAuthTag(data.subarray(data.length - 16));
    answer = JSON.parse(
      Buffer.concat([
        decipher.update(data.subarray(0, data.length - 16)),
        decipher.final(),
      ]).toString('utf8')
    );
  } catch {
    // Not sealed by the machine for this very request.
    return { ok: false, error: 'invalid_answer' };
  }
  const failed = answer as { ok?: unknown; code?: unknown };
  if (failed?.ok === false)
    return {
      ok: false,
      error: (bridgeRpcFailureCodes as readonly unknown[]).includes(failed.code)
        ? (failed.code as (typeof bridgeRpcFailureCodes)[number])
        : 'invalid_answer',
    };
  const parsed = bridgeRpcAnswerSchemas[kind].safeParse(
    (answer as { data?: unknown })?.data
  );
  return parsed.success && (answer as { ok?: unknown }).ok === true
    ? { ok: true, data: parsed.data as never }
    : { ok: false, error: 'invalid_answer' };
}

const READ_STATUS: Record<FleetReadError, number> = {
  bad_request: 422,
  unknown_thread: 404,
  unavailable: 503,
  offline: 503,
  timeout: 504,
  rate_limited: 429,
  unconfigured: 503,
  invalid_answer: 502,
};

/** HTTP status and closed code for a failed read. `machine_offline` is its own state for the UI. */
export function fleetReadFailure(error: FleetReadError) {
  return {
    status: READ_STATUS[error],
    error: error === 'offline' ? 'machine_offline' : error,
  };
}
