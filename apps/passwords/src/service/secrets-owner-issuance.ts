import {
  integer,
  PasswordsError,
  type PasswordsRecord,
  requireEnabled,
  uuid,
} from '@tuturuuu/storage-core/vault/passwords-contract';
import type { VaultRpc } from './machine-repository';
import {
  GRANT_TTL_MS,
  MACHINE_TTL_MS,
  mintMachineToken,
} from './machine-token';
import { credentials, post, type Scope } from './secrets-protocol';

/** Parent UI touchpoint. The owner port must verify the signed Passwords session,
 * fresh MFA, workspace membership and current vault ownership, never body claims.
 */
export async function issueOwnerMachineCredential(
  input: Scope & {
    grantRequestId: string;
    tokenRequestId: string;
    itemIds: string[];
    scopes: ('item.read' | 'item.write')[];
    grantExpiresAt: number;
  },
  deps: {
    request: Request;
    origin: string;
    enabled(): boolean;
    now(): number;
    rpc: VaultRpc;
    owner(scope: Scope): Promise<{ actor: string; vault: PasswordsRecord }>;
  }
) {
  requireEnabled(deps.enabled);
  post(deps.request, deps.origin, true);
  const scope = { wsId: uuid(input.wsId), vaultId: uuid(input.vaultId) };
  const grantId = uuid(input.grantRequestId);
  const tokenRequestId = uuid(input.tokenRequestId);
  if (
    tokenRequestId === grantId ||
    !Array.isArray(input.itemIds) ||
    input.itemIds.length < 1 ||
    input.itemIds.length > 16 ||
    new Set(input.itemIds).size !== input.itemIds.length ||
    input.itemIds.some((id) => !uuid(id)) ||
    !Array.isArray(input.scopes) ||
    input.scopes.length < 1 ||
    input.scopes.length > 2 ||
    new Set(input.scopes).size !== input.scopes.length ||
    input.scopes.some((s) => s !== 'item.read' && s !== 'item.write') ||
    !Number.isSafeInteger(input.grantExpiresAt) ||
    input.grantExpiresAt <= deps.now() ||
    input.grantExpiresAt > deps.now() + GRANT_TTL_MS
  )
    throw new PasswordsError('INVALID_INPUT');
  const { actor, vault } = await deps.owner(scope);
  if (vault.role !== 'owner') throw new PasswordsError('FORBIDDEN');
  uuid(actor);
  const minted = mintMachineToken();
  requireEnabled(deps.enabled);
  // Any failure from the first mutation onward preserves BOTH public operation IDs.
  // The UI must keep those IDs and reconcile; it must never submit replacement IDs automatically.
  try {
    const grant = await deps.rpc({
      p_ws: scope.wsId,
      p_vault: scope.vaultId,
      p_actor: actor,
      p_request: grantId,
      p_action: 'grant.create',
      p_input: {
        expected_revision: String(integer(vault.revision, 1)),
        grant_id: grantId,
        item_ids: input.itemIds,
        scopes: input.scopes,
        expires_at: new Date(input.grantExpiresAt).toISOString(),
      },
    });
    if (grant.replayed !== false)
      throw new PasswordsError('OPERATION_UNCERTAIN');
    requireEnabled(deps.enabled);
    const refreshed = await deps.owner(scope);
    if (refreshed.actor !== actor || refreshed.vault.role !== 'owner')
      throw new PasswordsError('FORBIDDEN');
    const expiresAt = Math.min(
      input.grantExpiresAt,
      deps.now() + MACHINE_TTL_MS - 1000
    );
    const issued = await deps.rpc({
      p_ws: scope.wsId,
      p_vault: scope.vaultId,
      p_actor: actor,
      p_request: tokenRequestId,
      p_action: 'token.issue',
      p_input: {
        expected_revision: String(integer(grant.revision, 1)),
        grant_id: grantId,
        token_id: minted.tokenId,
        token_digest: minted.digest,
        expires_at: new Date(expiresAt).toISOString(),
      },
    });
    if (issued.replayed !== false)
      throw new PasswordsError('OPERATION_UNCERTAIN');
    requireEnabled(deps.enabled);
    if (deps.request.signal.aborted) throw new PasswordsError('UNAVAILABLE');
    return credentials(scope, minted.token, expiresAt);
  } catch {
    throw new PasswordsError('OPERATION_UNCERTAIN');
  }
}
