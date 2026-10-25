import { randomUUID } from 'node:crypto';
import { PasswordsError } from '@tuturuuu/storage-core/vault/passwords-contract';
import { describe, expect, it, vi } from 'vitest';
import { fixture } from './secrets-api-test-fixture';
import { createSecretsOperation } from './secrets-operation';
import {
  boundedJson,
  MAX_BODY,
  OPERATION_PATH,
  SECRETS_ORIGIN,
} from './secrets-protocol';

describe('file-only operation', () => {
  it('round trips binary through actual envelope engine and maps committed action for CLI', async () => {
    const f = await fixture();
    const bytes = Buffer.from([0, 255, 10, 13, 127, 96]);
    const id = randomUUID();
    const write = await f.call(
      'put',
      { name: f.name, bytesBase64: bytes.toString('base64') },
      id
    );
    expect(write.status).toBe(200);
    expect(write.body.value).toMatchObject({ requestId: id, itemId: f.itemId });
    const get = await f.call('get', { name: f.name });
    expect(get.body.value).toEqual({
      name: f.name,
      bytesBase64: bytes.toString('base64'),
    });
    expect(get.headers.get('cache-control')).toContain('no-store');
    expect(
      (await f.call('request.status', { targetRequestId: id })).body.value
    ).toMatchObject({
      found: true,
      action: 'put',
      receipt: { itemId: f.itemId },
    });
    expect(f.keys.every((key) => key.every((byte) => byte === 0))).toBe(true);
    expect(JSON.stringify(f.calls)).not.toContain(bytes.toString('base64'));
  });
  it('disables before authentication and every external dependency', async () => {
    const context = vi.fn(async () => {
      throw new Error('must not execute');
    });
    const handle = createSecretsOperation({
      enabled: () => false,
      origin: SECRETS_ORIGIN,
      context,
    });
    const response = await handle(
      new Request(`${SECRETS_ORIGIN}${OPERATION_PATH}`, { method: 'POST' })
    );
    expect(response?.status).toBe(503);
    expect(context).not.toHaveBeenCalled();
  });
  it.each(['create', 'share', '__proto__', 'vault.create'])(
    'rejects unsupported action %s',
    async (action) => {
      const f = await fixture();
      expect((await f.call(action)).status).toBe(400);
      expect(f.contextCalls()).toBe(0);
    }
  );
  it('rejects unknown caller privilege fields before auth', async () => {
    const f = await fixture();
    expect((await f.call('list', { actor: randomUUID() })).status).toBe(400);
    expect(f.contextCalls()).toBe(0);
  });
  it('refuses query, wrong method, browser origin, and wrong content type without auth', async () => {
    const f = await fixture();
    for (const [suffix, method, headers] of [
      ['?value=sensitive', 'POST', {}],
      ['', 'GET', {}],
      ['', 'POST', { origin: SECRETS_ORIGIN }],
      ['', 'POST', { 'content-type': 'text/plain' }],
    ] as const) {
      const response = await f.handler(
        new Request(`${SECRETS_ORIGIN}${OPERATION_PATH}${suffix}`, {
          method,
          headers,
        })
      );
      expect(response?.status).toBeGreaterThanOrEqual(400);
    }
    expect(f.contextCalls()).toBe(0);
  });
  it('bounds body bytes and aborts stalled body consumption', async () => {
    const f = await fixture();
    const request = f.request('put', {
      name: f.name,
      bytesBase64: 'A'.repeat(MAX_BODY),
    });
    expect((await f.handler(request))?.status).toBe(413);
    expect(f.contextCalls()).toBe(0);
    const abort = new AbortController();
    const stream = new ReadableStream<Uint8Array>({ start() {} });
    const read = boundedJson(stream, 10, abort.signal);
    abort.abort();
    await expect(read).rejects.toMatchObject({ code: 'UNAVAILABLE' });
  });
  it('retains original write identity after lost commit response and performs no replay', async () => {
    const f = await fixture();
    const id = randomUUID();
    f.setLoseWrite(true);
    const result = await f.call(
      'put',
      {
        name: f.name,
        bytesBase64: Buffer.from('new synthetic value').toString('base64'),
      },
      id
    );
    expect(result.status).toBe(503);
    expect(result.body.code).toBe('operation_uncertain');
    expect(
      (await f.call('request.status', { targetRequestId: id })).body.value
        .action
    ).toBe('put');
    expect(f.calls.filter((c) => c.action === 'upload')).toHaveLength(2); // Seed plus one write.
  });
  it('lost upload stays unknown and cannot blindly reupload under the same identity', async () => {
    const f = await fixture();
    const id = randomUUID();
    f.setLoseUpload(true);
    const input = {
      name: f.name,
      bytesBase64: Buffer.from('candidate').toString('base64'),
    };
    expect((await f.call('put', input, id)).status).toBe(503);
    expect(
      (await f.call('request.status', { targetRequestId: id })).body.value
    ).toEqual({ found: false });
    f.setLoseUpload(false);
    expect((await f.call('put', input, id)).status).toBe(503);
    expect(f.calls.filter((c) => c.action === 'upload')).toHaveLength(2);
  });
  it('maps a later denial after write dispatch to UNKNOWN and never serializes thrown details', async () => {
    const f = await fixture();
    const spy = vi
      .spyOn(f.engine, 'putItem')
      .mockRejectedValue(new PasswordsError('FORBIDDEN'));
    expect(
      (await f.call('put', { name: f.name, bytesBase64: 'YQ==' })).status
    ).toBe(503);
    spy.mockRejectedValue(new Error('synthetic plaintext token SQL details'));
    const result = await f.call('put', { name: f.name, bytesBase64: 'YQ==' });
    expect(JSON.stringify(result.body)).not.toContain('synthetic');
  });
  it('fresh human owner rotates; stale proof cannot dispatch', async () => {
    const f = await fixture();
    f.setHumanFresh(false);
    expect((await f.call('rotate')).status).toBe(403);
    f.setHumanFresh(true);
    const id = randomUUID();
    expect((await f.call('rotate', {}, id)).body.value.requestId).toBe(id);
    expect(
      (await f.call('request.status', { targetRequestId: id })).body.value
        .action
    ).toBe('rotate');
    expect((await f.call('get', { name: f.name })).status).toBe(200);
  });
});
