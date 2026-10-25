import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { PasswordsVaultEngine } from './passwords-engine';
import { passwordsFixture } from './passwords-test-fixture';

describe('Passwords vault engine with real envelope crypto', () => {
  let f: ReturnType<typeof passwordsFixture>;
  const value = Buffer.from('synthetic-only-secret');
  beforeEach(async () => {
    f = passwordsFixture();
    await f.initialize();
  });
  const input = () => ({
    ...f.scope,
    requestId: randomUUID(),
    revision: Number(f.vault.revision),
    name: 'API_KEY',
  });
  const count = (action: string) =>
    f.calls.filter((c) => c.action === action).length;

  it('uses the create request UUID as vault identity and observes a lost response', async () => {
    f.setVaultExists(false);
    f.setLoseWrite(true);
    const operation = {
      wsId: f.scope.wsId,
      requestId: f.scope.vaultId,
      name: 'New vault',
    };
    await expect(f.engine.createVault(operation)).rejects.toThrow(
      'OPERATION_UNCERTAIN'
    );
    f.setLoseWrite(false);
    const restarted = new PasswordsVaultEngine(f.deps);
    expect(await restarted.createVault(operation)).toEqual({
      vaultId: operation.requestId,
    });
    expect(count('vault.create')).toBe(1);
    expect(f.keys).toHaveLength(1);
    expect(f.keys[0]?.every((byte) => byte === 0)).toBe(true);
  });

  it('stores only ciphertext, reveals after audit, and zeroes working keys', async () => {
    const put = await f.engine.putItem(input(), value);
    const stored = [...f.items.values()][0];
    expect(stored).not.toHaveProperty('byteLength');
    expect(stored).not.toHaveProperty('hash');
    expect(stored).not.toHaveProperty('suffix');
    expect(JSON.stringify(stored)).not.toContain(value.toString());
    expect([...f.files.values()][0]?.includes(0)).toBe(false);
    const revealed = await f.engine.revealItem({
      ...f.scope,
      itemId: put.itemId,
      requestId: randomUUID(),
    });
    expect(revealed.equals(value)).toBe(true);
    expect(count('item.read')).toBe(2);
    expect(count('upload')).toBe(1);
    expect(count('download')).toBe(2);
    expect(f.keys.every((key) => key.every((byte) => byte === 0))).toBe(true);
    revealed.fill(0);
  });

  it('denies another workspace, viewer writes and stale step-up before disclosure', async () => {
    await expect(
      f.engine.putItem({ ...input(), wsId: randomUUID() }, value)
    ).rejects.toThrow('FORBIDDEN');
    f.vault.role = 'viewer';
    await expect(f.engine.putItem(input(), value)).rejects.toThrow('FORBIDDEN');
    f.setFresh(false);
    await expect(
      f.engine.revealItem({
        ...f.scope,
        itemId: randomUUID(),
        requestId: randomUUID(),
      })
    ).rejects.toThrow('STEP_UP_REQUIRED');
    await expect(f.engine.rotateVault(input())).rejects.toThrow(
      'STEP_UP_REQUIRED'
    );
    expect(count('key.read')).toBe(0);
    expect(count('item.read')).toBe(0);
    expect(count('download')).toBe(0);
  });

  it('suppresses disclosure and key access when the mandatory audit fails', async () => {
    const put = await f.engine.putItem(input(), value);
    f.setAuditFailure(true);
    const before = count('download');
    await expect(
      f.engine.revealItem({
        ...f.scope,
        itemId: put.itemId,
        requestId: randomUUID(),
      })
    ).rejects.toThrow();
    await expect(f.engine.putItem(input(), value)).rejects.toThrow();
    expect(count('download')).toBe(before);
    expect(count('upload')).toBe(1);
  });

  it('retains an unknown upload and refuses a blind retry after process restart', async () => {
    const operation = input();
    f.setLoseUpload(true);
    await expect(f.engine.putItem(operation, value)).rejects.toThrow(
      'OPERATION_UNCERTAIN'
    );
    expect(f.files.size).toBe(1);
    f.setLoseUpload(false);
    const restarted = new PasswordsVaultEngine(f.deps);
    await expect(restarted.putItem(operation, value)).rejects.toThrow(
      'OPERATION_UNCERTAIN'
    );
    expect(count('upload')).toBe(1);
    expect(count('item.write')).toBe(0);
    expect(f.files.size).toBe(1);
  });

  it('observes only original action and metadata with a fresh audit request', async () => {
    const operation = input();
    const absent = await f.engine.observeOperation({
      ...f.scope,
      targetRequestId: operation.requestId,
    });
    expect(absent).toEqual({ found: false });
    await f.engine.putItem(operation, value);
    const before = f.receipts.size;
    const observation = await f.engine.observeOperation({
      ...f.scope,
      targetRequestId: operation.requestId,
    });
    expect(observation).toEqual({
      found: true,
      action: 'item.write',
      receipt: {
        vaultId: f.scope.vaultId,
        revision: 2,
        itemId: operation.requestId,
      },
    });
    expect(f.receipts.size).toBe(before + 1);
    expect(JSON.stringify(observation)).not.toContain('encrypted');
    expect(count('upload')).toBe(1);
    f.setAuditFailure(true);
    await expect(
      f.engine.observeOperation({
        ...f.scope,
        targetRequestId: operation.requestId,
      })
    ).rejects.toThrow();
  });

  it('checks actual uploaded bytes before SQL and retains a mismatched object', async () => {
    f.onDownload(() => {
      for (const bytes of f.files.values()) bytes[0] = (bytes[0] ?? 0) ^ 1;
    });
    await expect(f.engine.putItem(input(), value)).rejects.toThrow(
      'OPERATION_UNCERTAIN'
    );
    expect(count('item.write')).toBe(0);
    expect(f.files.size).toBe(1);
  });

  it('fails closed when the final disclosure audit fails after decryption', async () => {
    const put = await f.engine.putItem(input(), value);
    f.onDownload(() => f.setAuditFailure(true));
    await expect(
      f.engine.revealItem({
        ...f.scope,
        itemId: put.itemId,
        requestId: randomUUID(),
      })
    ).rejects.toThrow();
    expect(f.keys.every((key) => key.every((byte) => byte === 0))).toBe(true);
  });

  it('reconciles a committed write after a lost response without another upload', async () => {
    const operation = input();
    f.setLoseWrite(true);
    await expect(f.engine.putItem(operation, value)).rejects.toThrow(
      'OPERATION_UNCERTAIN'
    );
    f.setLoseWrite(false);
    const result = await new PasswordsVaultEngine(f.deps).putItem(
      operation,
      value
    );
    expect(result.itemId).toBe(operation.requestId);
    expect(result.revision).toBe(2);
    expect(count('item.write')).toBe(1);
    expect(count('upload')).toBe(1);
  });

  it('rejects tampered storage and authorization revoked during download', async () => {
    const put = await f.engine.putItem(input(), value);
    const [path, encrypted] = [...f.files.entries()][0]!;
    f.files.set(path, Buffer.from('invalid stored bytes'));
    await expect(
      f.engine.revealItem({
        ...f.scope,
        itemId: put.itemId,
        requestId: randomUUID(),
      })
    ).rejects.toThrow('UNAVAILABLE');
    f.files.set(path, encrypted);
    f.onDownload(() => f.setMember(false));
    await expect(
      f.engine.revealItem({
        ...f.scope,
        itemId: put.itemId,
        requestId: randomUUID(),
      })
    ).rejects.toThrow('FORBIDDEN');
    expect(f.keys.every((key) => key.every((byte) => byte === 0))).toBe(true);
  });

  it('rotates all files sequentially, retains old objects and activates once', async () => {
    const first = await f.engine.putItem(input(), value);
    const second = await f.engine.putItem(
      { ...input(), name: 'OTHER' },
      Buffer.from('second')
    );
    f.vault.rotation_required = true;
    const start = f.calls.length;
    const result = await f.engine.rotateVault(input());
    expect(result.revision).toBe(4);
    expect(f.vault.active_version).toBe(2);
    expect(f.vault.rotation_required).toBe(false);
    expect(f.files.size).toBe(4);
    expect(
      new Set([...f.items.values()].map((item) => item.encrypted_file_id)).size
    ).toBe(2);
    const actions = f.calls.slice(start).map((c) => c.action);
    expect(
      actions.filter(
        (c) => c === 'upload' || c === 'download' || c === 'vault.rotate'
      )
    ).toEqual([
      'download',
      'upload',
      'download',
      'download',
      'upload',
      'download',
      'vault.rotate',
    ]);
    for (const itemId of [first.itemId, second.itemId]) {
      const bytes = await f.engine.revealItem({
        ...f.scope,
        itemId,
        requestId: randomUUID(),
      });
      expect(bytes.length).toBeGreaterThan(0);
      bytes.fill(0);
    }
  });

  it('does not activate or restart a partial rotation', async () => {
    await f.engine.putItem(input(), value);
    const operation = input();
    f.setLoseUpload(true);
    await expect(f.engine.rotateVault(operation)).rejects.toThrow(
      'OPERATION_UNCERTAIN'
    );
    expect(f.vault.active_version).toBe(1);
    expect(count('vault.rotate')).toBe(0);
    f.setLoseUpload(false);
    await expect(
      new PasswordsVaultEngine(f.deps).rotateVault(operation)
    ).rejects.toThrow('OPERATION_UNCERTAIN');
    expect(count('upload')).toBe(2);
  });

  it('caps live items and rejects an oversized rotation before any file call', async () => {
    for (let index = 0; index < 16; index++)
      f.items.set(randomUUID(), {
        id: randomUUID(),
        name: `Item ${index}`,
        revision: 1,
        version: 1,
      });
    await expect(f.engine.putItem(input(), value)).rejects.toThrow('TOO_LARGE');
    f.items.set(randomUUID(), {
      id: randomUUID(),
      name: 'Seventeenth',
      revision: 1,
      version: 1,
    });
    await expect(f.engine.rotateVault(input())).rejects.toThrow('TOO_LARGE');
    expect(count('upload')).toBe(0);
    expect(count('download')).toBe(0);
  });

  it('stops all public operations before DB or storage and fences an in-flight write', async () => {
    f.setEnabled(false);
    const operations = [
      () => f.engine.vaults(f.scope.wsId),
      () => f.engine.items(f.scope),
      () => f.engine.members(f.scope),
      () => f.engine.audit(f.scope),
      () =>
        f.engine.observeOperation({
          ...f.scope,
          targetRequestId: randomUUID(),
        }),
      () =>
        f.engine.createVault({
          wsId: f.scope.wsId,
          requestId: randomUUID(),
          name: 'New',
        }),
      () => f.engine.putItem(input(), value),
      () =>
        f.engine.revealItem({
          ...f.scope,
          itemId: randomUUID(),
          requestId: randomUUID(),
        }),
      () =>
        f.engine.setMember({
          ...input(),
          userId: randomUUID(),
          role: 'viewer',
          revoked: true,
        }),
      () => f.engine.rotateVault(input()),
    ];
    for (const operation of operations)
      await expect(operation()).rejects.toThrow('STOPPED');
    expect(f.calls).toEqual([]);
    f.setEnabled(true);
    f.onDownload(() => f.setEnabled(false));
    const operation = input();
    await expect(f.engine.putItem(operation, value)).rejects.toThrow('STOPPED');
    expect(count('item.write')).toBe(0);
    f.setEnabled(true);
    await expect(
      new PasswordsVaultEngine(f.deps).putItem(operation, value)
    ).rejects.toThrow('OPERATION_UNCERTAIN');
    expect(count('upload')).toBe(1);
  });
});
