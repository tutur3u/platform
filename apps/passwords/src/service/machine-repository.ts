import { randomUUID } from 'node:crypto';
import {
  integer,
  PASSWORDS_MAX_ITEMS,
  PasswordsError,
  type PasswordsRecord,
  type PasswordsRepository,
  type PasswordsStorage,
  record,
  requireEnabled,
  rows,
  uuid,
} from '@tuturuuu/storage-core/vault/passwords-contract';
import {
  passwordsFilePath,
  passwordsObjectId,
  passwordsPhaseId,
} from '@tuturuuu/storage-core/vault/passwords-crypto';
import type { MachineProof } from './machine-token';
import type { Scope } from './secrets-protocol';

export type VaultRpc = (args: {
  p_ws: string;
  p_vault: string;
  p_actor: string | null;
  p_request: string;
  p_action: string;
  p_input: PasswordsRecord;
  p_token?: string;
  p_token_digest?: string;
}) => Promise<PasswordsRecord>;

export function createMachineRepository(
  scope: Scope,
  operationId: string,
  proof: MachineProof,
  deps: {
    enabled(): boolean;
    rpc: VaultRpc;
    storage: PasswordsStorage;
  }
) {
  const readable = new Set<string>();
  const writable = new Set<string>();
  async function execute(
    requestId: string,
    action: string,
    input: PasswordsRecord
  ) {
    requireEnabled(deps.enabled);
    const value = await deps.rpc({
      p_ws: scope.wsId,
      p_vault: scope.vaultId,
      p_actor: null,
      p_request: requestId,
      p_action: action,
      p_input: input,
      p_token: proof.tokenId,
      p_token_digest: proof.digest,
    });
    requireEnabled(deps.enabled);
    return value;
  }
  async function metadata() {
    const value = await execute(randomUUID(), 'item.list', {
      limit: PASSWORDS_MAX_ITEMS + 1,
    });
    if (value.replayed !== false) throw new PasswordsError('UNAVAILABLE');
    const vault = record(value.vault);
    if (
      vault.id !== scope.vaultId ||
      vault.ws_id !== scope.wsId ||
      !['editor', 'viewer'].includes(String(vault.role))
    )
      throw new PasswordsError('UNAVAILABLE');
    return { vault, items: rows(value.items, PASSWORDS_MAX_ITEMS + 1) };
  }
  const repository: PasswordsRepository = {
    async list(wsId) {
      if (wsId !== scope.wsId) throw new PasswordsError('FORBIDDEN');
      return { vaults: [(await metadata()).vault] };
    },
    async execute(actual, requestId, action, input) {
      if (
        actual.wsId !== scope.wsId ||
        actual.vaultId !== scope.vaultId ||
        ![
          'item.read',
          'item.list',
          'key.read',
          'item.write',
          'request.status',
        ].includes(action)
      )
        throw new PasswordsError('FORBIDDEN');
      const value = await execute(requestId, action, input);
      if (value.replayed === false && action === 'item.read') {
        const item = record(value.item);
        if (
          item.id !== input.item_id ||
          item.ws_id !== scope.wsId ||
          item.vault_id !== scope.vaultId ||
          item.encrypted_payload !== null
        )
          throw new PasswordsError('UNAVAILABLE');
        readable.add(
          passwordsFilePath({
            ...scope,
            itemId: uuid(item.id),
            version: integer(item.version, 1, 1000),
            fileId: uuid(item.encrypted_file_id),
          })
        );
      }
      if (value.replayed === false && action === 'key.read') {
        if (requestId !== passwordsPhaseId(operationId, 'key'))
          throw new PasswordsError('FORBIDDEN');
        const itemId = uuid(input.item_id);
        writable.add(
          passwordsFilePath({
            ...scope,
            itemId,
            version: integer(value.version, 1, 1000),
            fileId: passwordsObjectId(operationId, itemId),
          })
        );
      }
      return value;
    },
  };
  const storage: PasswordsStorage = {
    async upload(path, ciphertext) {
      requireEnabled(deps.enabled);
      if (!writable.delete(path)) throw new PasswordsError('FORBIDDEN');
      await metadata();
      const value = await deps.storage.upload(path, ciphertext);
      requireEnabled(deps.enabled);
      // Write-only principals can read back only their newly uploaded ciphertext.
      readable.add(path);
      return value;
    },
    async download(path) {
      requireEnabled(deps.enabled);
      if (!readable.has(path)) throw new PasswordsError('FORBIDDEN');
      await metadata();
      const bytes = await deps.storage.download(path);
      try {
        requireEnabled(deps.enabled);
        await metadata();
        return bytes;
      } catch (error) {
        bytes.fill(0);
        throw error;
      }
    },
  };
  return { repository, storage };
}
