import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import type { VaultKeyWrapper } from './crypto';
import {
  integer,
  type PasswordsAction,
  PasswordsError,
  type PasswordsRecord,
  type PasswordsRepository,
  type PasswordsScope,
  type PasswordsStorage,
  record,
  rows,
} from './passwords-contract';
import { PasswordsVaultEngine } from './passwords-engine';
import { workspaceKeyWrapper } from './workspace-key-wrapper';

export function passwordsFixture() {
  const wsId = randomUUID();
  const vaultId = randomUUID();
  const scope = { wsId, vaultId };
  const vault: PasswordsRecord = {
    id: vaultId,
    label: 'Vault',
    role: 'owner',
    revision: 1,
    active_version: 1,
    rotation_required: false,
  };
  const items = new Map<string, PasswordsRecord>();
  const files = new Map<string, Uint8Array>();
  const receipts = new Map<
    string,
    {
      action: PasswordsAction;
      input: PasswordsRecord;
      receipt: PasswordsRecord;
    }
  >();
  const calls: { action: string; input?: PasswordsRecord }[] = [];
  const keys: Buffer[] = [];
  const wrapper = workspaceKeyWrapper('synthetic-passwords-engine-master');
  let wrapped = '';
  let vaultExists = true;
  let enabled = true;
  let fresh = true;
  let member = true;
  let auditFailure = false;
  let loseUpload = false;
  let loseWrite = false;
  let failDownload = false;
  let afterDownload: (() => void) | undefined;
  const keyWrapper: VaultKeyWrapper = {
    async wrap(key) {
      keys.push(key);
      return wrapper.wrap(key);
    },
    async unwrap(value) {
      const key = await wrapper.unwrap(value);
      keys.push(key);
      return key;
    },
  };
  const authorize = vi.fn(async (workspace: string, requireFresh: boolean) => {
    if (!member || workspace !== wsId) throw new PasswordsError('FORBIDDEN');
    if (requireFresh && !fresh) throw new PasswordsError('STEP_UP_REQUIRED');
  });
  const repository: PasswordsRepository = {
    async list(workspace) {
      calls.push({ action: 'vault.list' });
      if (workspace !== wsId || !member) throw new PasswordsError('FORBIDDEN');
      return { vaults: vaultExists ? [structuredClone(vault)] : [] };
    },
    async execute(actualScope: PasswordsScope, requestId, action, input) {
      calls.push({ action, input });
      if (
        actualScope.wsId !== wsId ||
        actualScope.vaultId !== vaultId ||
        !member
      )
        throw new PasswordsError('FORBIDDEN');
      if (auditFailure) throw new Error('synthetic SQL detail must not escape');
      const old = receipts.get(requestId);
      if (old) {
        if (
          old.action !== action ||
          JSON.stringify(old.input) !== JSON.stringify(input)
        )
          throw new PasswordsError('INVALID_INPUT');
        return { ...old.receipt, replayed: true };
      }
      let result: PasswordsRecord = {};
      switch (action) {
        case 'request.status': {
          const observed = receipts.get(String(input.request_id));
          result = observed
            ? {
                status: 'committed',
                action: observed.action,
                receipt: observed.receipt,
              }
            : { status: 'unknown' };
          break;
        }
        case 'vault.create':
          wrapped = String(input.encrypted_data_key);
          vault.label = input.label;
          vaultExists = true;
          break;
        case 'key.read':
          result = {
            version: vault.active_version,
            encrypted_data_key: wrapped,
          };
          break;
        case 'item.list':
          result = {
            items: [...items.values()].map((item) => ({
              id: item.id,
              name: item.name,
              version: item.version,
              revision: item.revision,
              is_file: true,
            })),
          };
          break;
        case 'item.read': {
          if (vault.rotation_required)
            throw new PasswordsError('REVISION_CONFLICT');
          const item = items.get(String(input.item_id));
          if (!item) throw new PasswordsError('NOT_FOUND');
          result = { item: structuredClone(item), encrypted_data_key: wrapped };
          break;
        }
        case 'item.write': {
          if (integer(input.expected_revision) !== vault.revision)
            throw new PasswordsError('REVISION_CONFLICT');
          const previous = items.get(String(input.item_id));
          const revision = previous ? integer(previous.revision) + 1 : 1;
          items.set(String(input.item_id), {
            ...scope,
            ws_id: wsId,
            vault_id: vaultId,
            id: input.item_id,
            ...input,
            revision,
            encrypted_payload: null,
          });
          vault.revision = integer(vault.revision) + 1;
          result = { item_id: input.item_id, item_revision: revision };
          break;
        }
        case 'member.set':
          vault.rotation_required = true;
          vault.revision = integer(vault.revision) + 1;
          break;
        case 'rotation.snapshot':
          result = {
            items: [...items.values()].map((i) => structuredClone(i)),
            versions: [
              {
                ws_id: wsId,
                vault_id: vaultId,
                version: vault.active_version,
                encrypted_data_key: wrapped,
              },
            ],
          };
          break;
        case 'vault.rotate': {
          if (integer(input.expected_revision) !== vault.revision)
            throw new PasswordsError('REVISION_CONFLICT');
          for (const replacement of rows(input.items, 16)) {
            const item = record(items.get(String(replacement.id)));
            items.set(String(item.id), {
              ...item,
              ...replacement,
              revision: integer(item.revision) + 1,
              version: integer(vault.active_version) + 1,
            });
          }
          wrapped = String(input.encrypted_data_key);
          vault.active_version = integer(vault.active_version) + 1;
          vault.revision = integer(vault.revision) + 1;
          vault.rotation_required = false;
          break;
        }
        case 'member.list':
          result = { members: [] };
          break;
        case 'audit.list':
          result = { events: [] };
          break;
      }
      const receipt = {
        vault_id: vaultId,
        revision: vault.revision,
        active_version: vault.active_version,
        ...(action === 'item.write' ? result : {}),
      };
      receipts.set(requestId, {
        action,
        input: structuredClone(input),
        receipt,
      });
      if (
        loseWrite &&
        (action === 'item.write' ||
          action === 'vault.rotate' ||
          action === 'vault.create')
      )
        throw new PasswordsError('OPERATION_UNCERTAIN');
      return { ...receipt, ...result, replayed: false };
    },
  };
  const storage: PasswordsStorage = {
    async upload(path, bytes) {
      calls.push({ action: 'upload' });
      if (files.has(path)) throw new Error('immutable object overwrite');
      files.set(path, bytes.slice());
      if (loseUpload) throw new PasswordsError('OPERATION_UNCERTAIN');
      return { id: randomUUID() };
    },
    async download(path) {
      calls.push({ action: 'download' });
      if (failDownload) throw new PasswordsError('UNAVAILABLE');
      const bytes = files.get(path);
      if (!bytes) throw new PasswordsError('NOT_FOUND');
      afterDownload?.();
      return bytes.slice();
    },
  };
  const deps = {
    repository,
    storage,
    keyWrapper,
    enabled: () => enabled,
    authorize,
  };
  const engine = new PasswordsVaultEngine(deps);
  return {
    scope,
    vault,
    items,
    files,
    receipts,
    calls,
    keys,
    deps,
    engine,
    async initialize() {
      const key = Buffer.alloc(32, 7);
      wrapped = await wrapper.wrap(key);
      key.fill(0);
    },
    setVaultExists(value: boolean) {
      vaultExists = value;
    },
    setEnabled(value: boolean) {
      enabled = value;
    },
    setFresh(value: boolean) {
      fresh = value;
    },
    setMember(value: boolean) {
      member = value;
    },
    setAuditFailure(value: boolean) {
      auditFailure = value;
    },
    setLoseUpload(value: boolean) {
      loseUpload = value;
    },
    setLoseWrite(value: boolean) {
      loseWrite = value;
    },
    setFailDownload(value: boolean) {
      failDownload = value;
    },
    onDownload(callback: () => void) {
      afterDownload = callback;
    },
  };
}
