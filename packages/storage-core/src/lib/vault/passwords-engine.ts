import { randomUUID } from 'node:crypto';
import {
  createEncryptedDataKey,
  decryptDataKey,
  type VaultKeyWrapper,
} from './crypto';
import {
  integer,
  label,
  PASSWORDS_MAX_BYTES,
  PASSWORDS_MAX_ITEMS,
  PasswordsError,
  type PasswordsRecord,
  type PasswordsRepository,
  type PasswordsScope,
  type PasswordsStorage,
  record,
  requireEnabled,
  role,
  rows,
  scopeIds,
  text,
  uuid,
} from './passwords-contract';
import {
  openPasswordsFile,
  type PasswordsFileContext,
  passwordsFilePath,
  passwordsObjectId,
  passwordsPhaseId,
  sealPasswordsFile,
} from './passwords-crypto';

export interface PasswordsEngineDependencies {
  repository: PasswordsRepository;
  storage: PasswordsStorage;
  keyWrapper: VaultKeyWrapper;
  enabled(): boolean;
  authorize(wsId: string, fresh: boolean): Promise<void>;
}

export class PasswordsVaultEngine {
  constructor(private readonly deps: PasswordsEngineDependencies) {}

  async authorize(wsId: string, fresh = false) {
    requireEnabled(this.deps.enabled);
    uuid(wsId);
    await this.deps.authorize(wsId, fresh);
    requireEnabled(this.deps.enabled);
  }

  private async call(
    scope: PasswordsScope,
    requestId: string,
    action: Parameters<PasswordsRepository['execute']>[2],
    input: PasswordsRecord,
    fresh = false
  ) {
    scopeIds(scope);
    uuid(requestId);
    await this.authorize(scope.wsId, fresh);
    const result = await this.deps.repository.execute(
      scope,
      requestId,
      action,
      input
    );
    requireEnabled(this.deps.enabled);
    return result;
  }

  async vaults(wsId: string) {
    await this.authorize(wsId);
    const result = await this.deps.repository.list(wsId);
    requireEnabled(this.deps.enabled);
    return rows(result.vaults, 32);
  }

  async vault(
    scope: PasswordsScope,
    access: 'read' | 'write' | 'owner' = 'read'
  ) {
    scopeIds(scope);
    const vault = (await this.vaults(scope.wsId)).find(
      (v) => v.id === scope.vaultId
    );
    if (!vault) throw new PasswordsError('FORBIDDEN');
    const permission = role(vault.role);
    if (
      (access === 'write' && permission === 'viewer') ||
      (access === 'owner' && permission !== 'owner')
    )
      throw new PasswordsError('FORBIDDEN');
    return vault;
  }

  async items(scope: PasswordsScope) {
    const result = await this.call(scope, randomUUID(), 'item.list', {
      limit: PASSWORDS_MAX_ITEMS + 1,
    });
    return rows(result.items, PASSWORDS_MAX_ITEMS + 1);
  }

  async members(scope: PasswordsScope) {
    return rows(
      (await this.call(scope, randomUUID(), 'member.list', { limit: 100 }))
        .members,
      100
    );
  }

  async audit(scope: PasswordsScope) {
    await this.vault(scope, 'owner');
    return rows(
      (await this.call(scope, randomUUID(), 'audit.list', { limit: 50 }))
        .events,
      50
    );
  }

  async observeOperation(input: PasswordsScope & { targetRequestId: string }) {
    const result = await this.call(input, randomUUID(), 'request.status', {
      request_id: uuid(input.targetRequestId),
    });
    if (result.status === 'unknown') return { found: false };
    if (result.status !== 'committed') throw new PasswordsError('UNAVAILABLE');
    const receipt = record(result.receipt);
    return {
      found: true,
      action: text(result.action, 64),
      receipt: {
        ...(receipt.vault_id == null
          ? {}
          : { vaultId: uuid(receipt.vault_id) }),
        ...(receipt.revision == null
          ? {}
          : { revision: integer(receipt.revision, 1) }),
        ...(receipt.item_id == null ? {} : { itemId: uuid(receipt.item_id) }),
      },
    };
  }

  private async committed(
    scope: PasswordsScope,
    requestId: string,
    action: string,
    fresh = false
  ) {
    const status = await this.call(
      scope,
      randomUUID(),
      'request.status',
      { request_id: uuid(requestId) },
      fresh
    );
    if (status.status === 'unknown') return null;
    if (status.status !== 'committed' || status.action !== action)
      throw new PasswordsError('INVALID_INPUT');
    return record(status.receipt);
  }

  private revision(vault: PasswordsRecord, expected: number) {
    if (integer(vault.revision, 1) !== integer(expected, 1))
      throw new PasswordsError('REVISION_CONFLICT');
  }

  private ready(vault: PasswordsRecord) {
    if (vault.rotation_required !== false)
      throw new PasswordsError('REVISION_CONFLICT');
  }

  async createVault(input: { wsId: string; requestId: string; name: string }) {
    label(input.name);
    const scope = { wsId: input.wsId, vaultId: uuid(input.requestId) };
    const existing = (await this.vaults(input.wsId)).find(
      (v) => v.id === scope.vaultId
    );
    if (existing) {
      if (existing.label !== input.name)
        throw new PasswordsError('INVALID_INPUT');
      const receipt = await this.committed(
        scope,
        input.requestId,
        'vault.create'
      );
      if (!receipt) throw new PasswordsError('OPERATION_UNCERTAIN');
      return { vaultId: uuid(receipt.vault_id) };
    }
    const key = await createEncryptedDataKey(this.deps.keyWrapper);
    try {
      const result = await this.call(scope, input.requestId, 'vault.create', {
        label: input.name,
        encrypted_data_key: key.encryptedDataKey,
      });
      return { vaultId: uuid(result.vault_id) };
    } finally {
      key.dataKey.fill(0);
    }
  }

  private fileContext(
    scope: PasswordsScope,
    item: PasswordsRecord
  ): PasswordsFileContext {
    if (
      item.ws_id !== scope.wsId ||
      item.vault_id !== scope.vaultId ||
      item.encrypted_payload !== null
    )
      throw new PasswordsError('UNAVAILABLE');
    return {
      ...scope,
      itemId: uuid(item.id),
      version: integer(item.version, 1, 1000),
      fileId: uuid(item.encrypted_file_id),
    };
  }

  private async download(
    scope: PasswordsScope,
    item: PasswordsRecord,
    key: Buffer
  ) {
    const context = this.fileContext(scope, item);
    await this.authorize(scope.wsId, true);
    const bytes = await this.deps.storage.download(passwordsFilePath(context));
    try {
      requireEnabled(this.deps.enabled);
      if (bytes.byteLength !== integer(item.ciphertext_bytes, 1))
        throw new PasswordsError('UNAVAILABLE');
      return openPasswordsFile(
        bytes,
        text(item.encrypted_metadata, 65536),
        key,
        context
      );
    } finally {
      bytes.fill(0);
    }
  }

  private async upload(
    context: PasswordsFileContext,
    plaintext: Uint8Array,
    key: Buffer,
    fresh: boolean
  ) {
    await this.authorize(context.wsId, fresh);
    const sealed = sealPasswordsFile(plaintext, key, context);
    try {
      const path = passwordsFilePath(context);
      const stored = await this.deps.storage.upload(path, sealed.ciphertext);
      await this.authorize(context.wsId, fresh);
      const actual = await this.deps.storage.download(path);
      try {
        if (
          actual.byteLength !== sealed.ciphertext.byteLength ||
          !Buffer.from(actual).equals(sealed.ciphertext)
        )
          throw new PasswordsError('OPERATION_UNCERTAIN');
      } finally {
        actual.fill(0);
      }
      requireEnabled(this.deps.enabled);
      return {
        encrypted_file_id: context.fileId,
        storage_object_id: uuid(stored.id),
        encrypted_metadata: sealed.encryptedMetadata,
        ciphertext_bytes: sealed.ciphertext.byteLength,
      };
    } finally {
      sealed.ciphertext.fill(0);
    }
  }

  async putItem(
    input: PasswordsScope & {
      requestId: string;
      revision: number;
      name: string;
    },
    plaintext: Uint8Array
  ) {
    requireEnabled(this.deps.enabled);
    if (plaintext.byteLength > PASSWORDS_MAX_BYTES)
      throw new PasswordsError('TOO_LARGE');
    label(input.name);
    const vault = await this.vault(input, 'write');
    const prior = await this.committed(input, input.requestId, 'item.write');
    if (prior)
      return {
        revision: integer(prior.revision, 1),
        itemId: uuid(prior.item_id),
      };
    this.ready(vault);
    this.revision(vault, input.revision);
    const items = await this.items(input);
    if (items.length > PASSWORDS_MAX_ITEMS)
      throw new PasswordsError('TOO_LARGE');
    const item = items.find(
      (i) => text(i.name).toLowerCase() === input.name.toLowerCase()
    );
    if (!item && items.length >= PASSWORDS_MAX_ITEMS)
      throw new PasswordsError('TOO_LARGE');
    const itemId = item ? uuid(item.id) : uuid(input.requestId);
    const expectedItemRevision = item ? integer(item.revision, 1) : 0;
    // A replay deliberately returns no key. This durable receipt prevents a second
    // upload after a lost upload/CAS response, including after process restart.
    const admitted = await this.call(
      input,
      passwordsPhaseId(input.requestId, 'key'),
      'key.read',
      {
        item_id: itemId,
        expected_revision: String(input.revision),
        expected_item_revision: String(expectedItemRevision),
      }
    );
    if (admitted.replayed !== false)
      throw new PasswordsError('OPERATION_UNCERTAIN');
    const key = await decryptDataKey(
      text(admitted.encrypted_data_key),
      this.deps.keyWrapper
    );
    try {
      const version = integer(admitted.version, 1, 1000);
      const file = await this.upload(
        {
          ...input,
          itemId,
          version,
          fileId: passwordsObjectId(input.requestId, itemId),
        },
        plaintext,
        key,
        false
      );
      const result = await this.call(input, input.requestId, 'item.write', {
        ...file,
        item_id: itemId,
        name: input.name,
        version,
        expected_revision: String(input.revision),
        expected_item_revision: String(expectedItemRevision),
      });
      return {
        revision: integer(result.revision, 1),
        itemId: uuid(result.item_id),
      };
    } finally {
      key.fill(0);
    }
  }

  async revealItem(
    input: PasswordsScope & { requestId: string; itemId: string }
  ) {
    await this.authorize(input.wsId, true);
    this.ready(await this.vault(input));
    const result = await this.call(
      input,
      input.requestId,
      'item.read',
      { item_id: uuid(input.itemId) },
      true
    );
    if (result.replayed !== false)
      throw new PasswordsError('OPERATION_UNCERTAIN');
    const item = record(result.item);
    if (item.id !== input.itemId) throw new PasswordsError('UNAVAILABLE');
    const key = await decryptDataKey(
      text(result.encrypted_data_key),
      this.deps.keyWrapper
    );
    let plaintext: Buffer | undefined;
    try {
      plaintext = await this.download(input, item, key);
      await this.authorize(input.wsId, true);
      // Re-admit disclosure after storage I/O so revocation/rotation during a
      // download cannot release an obsolete value. Audit failure still denies.
      const current = await this.call(
        input,
        randomUUID(),
        'item.read',
        { item_id: input.itemId },
        true
      );
      const currentItem = record(current.item);
      if (
        currentItem.revision !== item.revision ||
        currentItem.encrypted_file_id !== item.encrypted_file_id
      )
        throw new PasswordsError('REVISION_CONFLICT');
      return plaintext;
    } catch (error) {
      plaintext?.fill(0);
      throw error;
    } finally {
      key.fill(0);
    }
  }

  async setMember(
    input: PasswordsScope & {
      requestId: string;
      revision: number;
      userId: string;
      role: string;
      revoked: boolean;
    }
  ) {
    await this.authorize(input.wsId, true);
    await this.vault(input, 'owner');
    if (typeof input.revoked !== 'boolean')
      throw new PasswordsError('INVALID_INPUT');
    const result = await this.call(
      input,
      input.requestId,
      'member.set',
      {
        expected_revision: String(integer(input.revision, 1)),
        user_id: uuid(input.userId),
        role: role(input.role),
        revoked: input.revoked,
      },
      true
    );
    return { revision: integer(result.revision, 1) };
  }

  async rotateVault(
    input: PasswordsScope & { requestId: string; revision: number }
  ) {
    await this.authorize(input.wsId, true);
    const vault = await this.vault(input, 'owner');
    const prior = await this.committed(
      input,
      input.requestId,
      'vault.rotate',
      true
    );
    if (prior) return { revision: integer(prior.revision, 1) };
    this.revision(vault, input.revision);
    const snapshot = await this.call(
      input,
      passwordsPhaseId(input.requestId, 'snapshot'),
      'rotation.snapshot',
      { expected_revision: String(input.revision) },
      true
    );
    if (snapshot.replayed !== false)
      throw new PasswordsError('OPERATION_UNCERTAIN');
    const items = rows(snapshot.items, PASSWORDS_MAX_ITEMS);
    const versions = rows(snapshot.versions, 1);
    const active = versions[0];
    if (
      !active ||
      active.ws_id !== input.wsId ||
      active.vault_id !== input.vaultId
    )
      throw new PasswordsError('UNAVAILABLE');
    const oldVersion = integer(active.version, 1, 999);
    if (oldVersion !== integer(vault.active_version, 1, 999))
      throw new PasswordsError('REVISION_CONFLICT');
    if (
      new Set(items.map((item) => uuid(item.id))).size !== items.length ||
      items.some((item) => item.version !== oldVersion)
    )
      throw new PasswordsError('UNAVAILABLE');
    const oldKey = await decryptDataKey(
      text(active.encrypted_data_key),
      this.deps.keyWrapper
    );
    let nextKey: Buffer | undefined;
    try {
      const next = await createEncryptedDataKey(this.deps.keyWrapper);
      nextKey = next.dataKey;
      const replacements: PasswordsRecord[] = [];
      for (const item of items) {
        const plaintext = await this.download(input, item, oldKey);
        try {
          const file = await this.upload(
            {
              ...input,
              itemId: uuid(item.id),
              version: oldVersion + 1,
              fileId: passwordsObjectId(input.requestId, uuid(item.id)),
            },
            plaintext,
            nextKey,
            true
          );
          replacements.push({
            ...file,
            id: item.id,
            expected_item_revision: String(integer(item.revision, 1)),
          });
        } finally {
          plaintext.fill(0);
        }
      }
      const result = await this.call(
        input,
        input.requestId,
        'vault.rotate',
        {
          expected_revision: String(input.revision),
          encrypted_data_key: next.encryptedDataKey,
          items: replacements,
        },
        true
      );
      return { revision: integer(result.revision, 1) };
    } finally {
      oldKey.fill(0);
      nextKey?.fill(0);
    }
  }
}
