/**
 * Credential put, rename, reveal and key status. The caller identity comes
 * from the entrypoint the binding targets, never from the request. Values are
 * sealed and verified here before Postgres sees them, and nothing in this
 * module logs a value, a key or a payload.
 */
import {
  openWorkspaceSecret,
  sealWorkspaceSecret,
  type WorkspaceSecretBinding,
} from '@tuturuuu/vault-crypto';
import { getWorkspaceSecretTier } from '@tuturuuu/utils/workspace-secret-policy';
import type {
  WorkspaceSecretFailure as Failure,
  WorkspaceSecretKeyStatusResult as KeyStatusResult,
  WorkspaceSecretPutInput as PutInput,
  WorkspaceSecretPutResult as PutResult,
  WorkspaceSecretRenameInput as RenameInput,
  WorkspaceSecretRevealInput as RevealInput,
  WorkspaceSecretRevealResult as RevealResult,
} from '@tuturuuu/utils/workspace-secrets/protocol';
import { type Db, DbError, fromByteaHex, toByteaHex } from './db';
import { activeKekVersion, type KekEnv, KekConfigError, loadKek } from './kek';
import {
  type CallerId,
  canPut,
  canReadKeyStatus,
  canReveal,
  type RevealPurpose,
} from './policy';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const MAX_NAME_CHARS = 128;
const MAX_VALUE_CHARS = 4096;
const REVEAL_PURPOSES: readonly RevealPurpose[] = [
  'ai-agents',
  'discord-watcher',
  'mobile-calendar',
  'storage',
];

export type {
  WorkspaceSecretFailure as Failure,
  WorkspaceSecretKeyStatusResult as KeyStatusResult,
  WorkspaceSecretPutInput as PutInput,
  WorkspaceSecretPutResult as PutResult,
  WorkspaceSecretRenameInput as RenameInput,
  WorkspaceSecretRevealInput as RevealInput,
  WorkspaceSecretRevealResult as RevealResult,
} from '@tuturuuu/utils/workspace-secrets/protocol';

export interface ServiceDeps {
  db: Db;
  env: KekEnv;
  randomUUID?: () => string;
}

interface PutRow {
  status: 'ok' | 'replayed' | 'conflict' | 'not_found' | 'not_credential';
  secret_id: string;
  value_rev: number | string | null;
}

interface CredentialRow {
  secret_id: string;
  name: string;
  value_rev: number | string;
  kek_version: number | null;
  wrapped_dek: string | null;
  ciphertext: string | null;
  legacy_value: string | null;
}

const normalizeName = (name: unknown) =>
  typeof name === 'string' ? name.trim() : '';

const isRevision = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

function toRevision(value: number | string | null): number | null {
  if (value === null) return null;
  const revision = typeof value === 'string' ? Number(value) : value;
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : null;
}

function validName(name: string) {
  return name.length > 0 && name.length <= MAX_NAME_CHARS;
}

function failure(error: unknown): Failure {
  if (error instanceof DbError || error instanceof KekConfigError) {
    // Names the failure class only; no request or key material.
    console.error('workspace_secrets_unavailable', error.message);
    return { status: 'unavailable' };
  }
  console.error('workspace_secrets_unavailable', 'unexpected');
  return { status: 'unavailable' };
}

async function sealAndVerify(
  env: KekEnv,
  binding: WorkspaceSecretBinding,
  sourceRev: number,
  value: string
) {
  const kekVersion = activeKekVersion(env);
  const kek = loadKek(env, kekVersion);
  try {
    const sealed = await sealWorkspaceSecret({
      binding,
      kek,
      kekVersion,
      sourceRev,
      value,
    });
    // Decrypt once before storing, so a payload that cannot be read back is
    // never written.
    const roundTrip = await openWorkspaceSecret({
      binding,
      ciphertext: sealed.ciphertext,
      kek,
      kekVersion,
      sourceRev,
      wrappedDek: sealed.wrappedDek,
    });
    if (roundTrip !== value) throw new KekConfigError('round_trip_failed');
    return { ...sealed, kekVersion };
  } finally {
    kek.fill(0);
  }
}

async function writePayload(
  db: Db,
  input: {
    wsId: string;
    secretId: string;
    name: string;
    expectedValueRev: number | null;
    requestId: string;
    sealed: Awaited<ReturnType<typeof sealAndVerify>>;
  }
): Promise<PutResult> {
  const rows = await db.rpc<PutRow[]>('put_workspace_secret_credential', {
    p_ciphertext: toByteaHex(input.sealed.ciphertext),
    p_expected_rev: input.expectedValueRev,
    p_kek_version: input.sealed.kekVersion,
    p_last4: input.sealed.last4 || null,
    p_name: input.name,
    p_request_id: input.requestId,
    p_secret_id: input.secretId,
    p_wrapped_dek: toByteaHex(input.sealed.wrappedDek),
    p_ws_id: input.wsId,
  });
  const row = rows[0];
  if (!row) return { status: 'unavailable' };
  if (row.status === 'ok' || row.status === 'replayed') {
    const valueRev = toRevision(row.value_rev);
    if (valueRev === null) return { status: 'unavailable' };
    return {
      last4: input.sealed.last4,
      secretId: row.secret_id,
      status: 'ok',
      valueRev,
    };
  }
  if (row.status === 'conflict') {
    return { currentValueRev: toRevision(row.value_rev), status: 'conflict' };
  }
  return { status: row.status };
}

export async function putCredential(
  deps: ServiceDeps,
  caller: CallerId,
  input: PutInput
): Promise<PutResult> {
  const name = normalizeName(input?.name);
  const create = input?.expectedValueRev === undefined;
  if (
    typeof input?.wsId !== 'string' ||
    !UUID.test(input.wsId) ||
    typeof input.requestId !== 'string' ||
    !UUID.test(input.requestId) ||
    !validName(name) ||
    typeof input.value !== 'string' ||
    input.value.length === 0 ||
    input.value.length > MAX_VALUE_CHARS ||
    (input.secretId !== undefined && !UUID.test(input.secretId)) ||
    (create && input.secretId !== undefined) ||
    (!create &&
      (input.secretId === undefined || !isRevision(input.expectedValueRev)))
  ) {
    return { status: 'invalid' };
  }
  if (!canPut(caller, name)) return { status: 'forbidden' };
  if (getWorkspaceSecretTier(name) !== 'credential') {
    return { status: 'not_credential' };
  }

  const secretId = input.secretId ?? (deps.randomUUID ?? crypto.randomUUID)();
  const expectedValueRev = create ? null : (input.expectedValueRev as number);
  const sourceRev = expectedValueRev === null ? 0 : expectedValueRev + 1;
  try {
    const sealed = await sealAndVerify(
      deps.env,
      { name, secretId, wsId: input.wsId },
      sourceRev,
      input.value
    );
    return await writePayload(deps.db, {
      expectedValueRev,
      name,
      requestId: input.requestId,
      sealed,
      secretId,
      wsId: input.wsId,
    });
  } catch (error) {
    return failure(error);
  }
}

async function readCredential(
  deps: ServiceDeps,
  wsId: string,
  name: string
): Promise<
  | { status: 'ok'; row: CredentialRow; value: string; valueRev: number }
  | { status: 'not_found' }
> {
  const rows = await deps.db.rpc<CredentialRow[]>(
    'get_workspace_secret_credential',
    { p_name: name, p_ws_id: wsId }
  );
  const row = rows[0];
  const valueRev = row ? toRevision(row.value_rev) : null;
  if (!row || valueRev === null) return { status: 'not_found' };

  if (row.ciphertext && row.wrapped_dek && row.kek_version) {
    const kek = loadKek(deps.env, row.kek_version);
    try {
      const value = await openWorkspaceSecret({
        binding: { name: row.name, secretId: row.secret_id, wsId },
        ciphertext: fromByteaHex(row.ciphertext),
        kek,
        kekVersion: row.kek_version,
        sourceRev: valueRev,
        wrappedDek: fromByteaHex(row.wrapped_dek),
      });
      return { row, status: 'ok', value, valueRev };
    } finally {
      kek.fill(0);
    }
  }
  if (typeof row.legacy_value === 'string' && row.legacy_value.length > 0) {
    return { row, status: 'ok', value: row.legacy_value, valueRev };
  }
  return { status: 'not_found' };
}

export async function revealCredential(
  deps: ServiceDeps,
  caller: CallerId,
  input: RevealInput
): Promise<RevealResult> {
  const name = normalizeName(input?.name);
  if (
    typeof input?.wsId !== 'string' ||
    !UUID.test(input.wsId) ||
    !validName(name) ||
    !REVEAL_PURPOSES.includes(input.purpose)
  ) {
    return { status: 'invalid' };
  }
  if (!canReveal(caller, name, input.purpose)) return { status: 'forbidden' };
  if (getWorkspaceSecretTier(name) !== 'credential') {
    return { status: 'not_credential' };
  }
  try {
    const result = await readCredential(deps, input.wsId, name);
    if (result.status !== 'ok') return result;
    return { status: 'ok', value: result.value, valueRev: result.valueRev };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Renames a credential by re-sealing it for the new name and revision inside
 * the Worker; the plaintext never leaves it.
 */
export async function renameCredential(
  deps: ServiceDeps,
  caller: CallerId,
  input: RenameInput
): Promise<PutResult> {
  const fromName = normalizeName(input?.fromName);
  const toName = normalizeName(input?.toName);
  if (
    typeof input?.wsId !== 'string' ||
    !UUID.test(input.wsId) ||
    typeof input.secretId !== 'string' ||
    !UUID.test(input.secretId) ||
    typeof input.requestId !== 'string' ||
    !UUID.test(input.requestId) ||
    !validName(fromName) ||
    !validName(toName) ||
    !isRevision(input.expectedValueRev)
  ) {
    return { status: 'invalid' };
  }
  if (!canPut(caller, fromName) || !canPut(caller, toName)) {
    return { status: 'forbidden' };
  }
  if (
    getWorkspaceSecretTier(fromName) !== 'credential' ||
    getWorkspaceSecretTier(toName) !== 'credential'
  ) {
    return { status: 'not_credential' };
  }
  try {
    const current = await readCredential(deps, input.wsId, fromName);
    if (current.status !== 'ok' || current.row.secret_id !== input.secretId) {
      return { status: 'not_found' };
    }
    if (current.valueRev !== input.expectedValueRev) {
      return { currentValueRev: current.valueRev, status: 'conflict' };
    }
    const sealed = await sealAndVerify(
      deps.env,
      { name: toName, secretId: input.secretId, wsId: input.wsId },
      input.expectedValueRev + 1,
      current.value
    );
    return await writePayload(deps.db, {
      expectedValueRev: input.expectedValueRev,
      name: toName,
      requestId: input.requestId,
      sealed,
      secretId: input.secretId,
      wsId: input.wsId,
    });
  } catch (error) {
    return failure(error);
  }
}

export async function credentialKeyStatus(
  deps: ServiceDeps,
  caller: CallerId,
  input: { wsId: string; keyId: string }
): Promise<KeyStatusResult> {
  if (
    typeof input?.wsId !== 'string' ||
    !UUID.test(input.wsId) ||
    typeof input.keyId !== 'string' ||
    !UUID.test(input.keyId)
  ) {
    return { status: 'invalid' };
  }
  if (!canReadKeyStatus(caller)) return { status: 'forbidden' };
  try {
    const status = await deps.db.rpc<string>(
      'workspace_secret_credential_status',
      { p_secret_id: input.keyId, p_ws_id: input.wsId }
    );
    if (status === 'active' || status === 'invalid' || status === 'missing') {
      return { keyStatus: status, status: 'ok' };
    }
    return { status: 'unavailable' };
  } catch (error) {
    return failure(error);
  }
}
