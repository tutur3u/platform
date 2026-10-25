import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createMachineRepository } from './machine-repository';
import { mintMachineToken, parseMachineToken } from './machine-token';
import { fixture } from './secrets-api-test-fixture';

describe('machine principal', () => {
  it('uses canonical random 256-bit bearer with public UUID; retains digest only', () => {
    const first = mintMachineToken();
    const second = mintMachineToken();
    expect(first.token).not.toBe(second.token);
    expect(parseMachineToken(first.token)).toEqual({
      tokenId: first.tokenId,
      digest: first.digest,
    });
    expect(first.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(() => parseMachineToken(`${first.token}=`)).toThrow();
    expect(() => parseMachineToken('pwm1.invalid.invalid')).toThrow();
  });
  it('read-only lists only grant metadata and rejects put and rotation', async () => {
    const f = await fixture('machine', ['item.read']);
    await f.engine.putItem(
      {
        ...f.scope,
        name: 'OUTSIDE_GRANT',
        requestId: randomUUID(),
        revision: Number(f.vault.revision),
      },
      Buffer.from('outside value')
    );
    const result = await f.call('list');
    expect(result.body.value.items).toEqual([{ id: f.itemId, name: f.name }]);
    expect(JSON.stringify(result.body)).not.toContain('OUTSIDE_GRANT');
    expect((await f.call('get', { name: 'OUTSIDE_GRANT' })).status).toBe(404);
    expect(
      (await f.call('put', { name: f.name, bytesBase64: 'YQ==' })).status
    ).toBe(403);
    expect((await f.call('rotate')).status).toBe(403);
    expect((await f.call('get', { name: f.name })).status).toBe(200);
    expect(f.rpcCalls.every((c) => c.p_actor === null)).toBe(true);
    expect(JSON.stringify(f.rpcCalls)).not.toContain(f.token.token);
  });
  it('write-only can replace a granted item but cannot download its old value', async () => {
    const f = await fixture('machine', ['item.write']);
    expect((await f.call('get', { name: f.name })).status).toBe(403);
    const before = f.calls.filter((c) => c.action === 'download').length;
    expect(
      (await f.call('put', { name: f.name, bytesBase64: 'YQ==' })).status
    ).toBe(200);
    expect(f.calls.filter((c) => c.action === 'download').length - before).toBe(
      1
    );
    expect(
      (await f.call('put', { name: 'UNGRANTED_NEW_ITEM', bytesBase64: 'YQ==' }))
        .status
    ).toBe(503);
    expect((await f.call('rotate')).status).toBe(403);
  });
  it('revocation during download suppresses plaintext', async () => {
    const f = await fixture('machine');
    f.onDownload(() => f.setLive(false));
    const result = await f.call('get', { name: f.name });
    expect(result.status).toBe(403);
    expect(JSON.stringify(result.body)).not.toContain(
      Buffer.from('original synthetic value').toString('base64')
    );
  });
  it('rejects arbitrary storage paths without an admitted read or write', async () => {
    const f = await fixture('machine');
    const machine = createMachineRepository(f.scope, randomUUID(), f.token, {
      enabled: f.deps.enabled,
      rpc: f.rpc,
      storage: f.deps.storage,
    });
    const oldPath = [...f.files.keys()][0]!;
    await expect(machine.storage.download(oldPath)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      machine.storage.upload(oldPath, new Uint8Array())
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
