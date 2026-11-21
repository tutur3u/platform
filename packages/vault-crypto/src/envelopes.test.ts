import { describe, expect, it } from 'vitest';
import {
  decodeSymmetricEnvelope,
  encodeSymmetricEnvelope,
  openSymmetric,
  sealSymmetric,
} from './aead';
import { randomBytes, utf8 } from './bytes';
import {
  decodeHpkeEnvelope,
  encodeHpkeEnvelope,
  generateKemKeyPair,
  openWith,
  sealTo,
} from './hpke';

const ctx = {
  deployment: 'test',
  vault_id: new Uint8Array(32).fill(7),
  env: 'env-1',
  variable_id: 'var-1',
  version: 3,
  epoch: 1,
  cipher: 'aead-edk',
};

describe('symmetric envelopes', () => {
  it('round-trips and uses a fresh enc_id and nonce each time', async () => {
    const key = randomBytes(32);
    const a = await sealSymmetric(key, 'value', ctx, utf8('secret'));
    const b = await sealSymmetric(key, 'value', ctx, utf8('secret'));
    expect(a.enc_id).not.toEqual(b.enc_id);
    expect(a.ct).not.toEqual(b.ct);
    expect(
      new TextDecoder().decode(await openSymmetric(key, 'value', ctx, a))
    ).toBe('secret');
  });

  it('rejects a wrong key, a moved row, another purpose and tampering', async () => {
    const key = randomBytes(32);
    const env = await sealSymmetric(key, 'value', ctx, utf8('secret'));
    await expect(
      openSymmetric(randomBytes(32), 'value', ctx, env)
    ).rejects.toMatchObject({ code: 'decrypt_failed' });
    await expect(
      openSymmetric(key, 'value', { ...ctx, variable_id: 'var-2' }, env)
    ).rejects.toMatchObject({ code: 'decrypt_failed' });
    await expect(
      openSymmetric(key, 'value', { ...ctx, version: 2 }, env)
    ).rejects.toMatchObject({ code: 'decrypt_failed' });
    await expect(openSymmetric(key, 'wrap', ctx, env)).rejects.toMatchObject({
      code: 'decrypt_failed',
    });
    const flipped = env.ct.slice();
    flipped[0] = (flipped[0] ?? 0) ^ 1;
    await expect(
      openSymmetric(key, 'value', ctx, { ...env, ct: flipped })
    ).rejects.toMatchObject({ code: 'decrypt_failed' });
    await expect(
      openSymmetric(key, 'value', ctx, { ...env, ct: env.ct.slice(0, -1) })
    ).rejects.toMatchObject({ code: 'decrypt_failed' });
    await expect(
      openSymmetric(key, 'value', ctx, { ...env, enc_id: randomBytes(16) })
    ).rejects.toMatchObject({ code: 'decrypt_failed' });
  });

  it('rejects unknown versions and suites and a caller-supplied enc_id', async () => {
    const key = randomBytes(32);
    const env = await sealSymmetric(key, 'value', ctx, utf8('x'));
    await expect(
      openSymmetric(key, 'value', ctx, { ...env, suite: 2 })
    ).rejects.toMatchObject({ code: 'unsupported_format' });
    await expect(
      openSymmetric(key, 'value', ctx, { ...env, v: 2 })
    ).rejects.toMatchObject({ code: 'unsupported_format' });
    await expect(
      sealSymmetric(
        key,
        'value',
        { ...ctx, enc_id: randomBytes(16) },
        utf8('x')
      )
    ).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('encodes canonically and rejects extra fields', async () => {
    const env = await sealSymmetric(randomBytes(32), 'value', ctx, utf8('x'));
    expect(decodeSymmetricEnvelope(encodeSymmetricEnvelope(env))).toEqual(env);
    const { encodeCanonical } = await import('./canonical');
    expect(() =>
      decodeSymmetricEnvelope(encodeCanonical({ ...env, extra: 1 }))
    ).toThrow();
  });
});

describe('HPKE envelopes', () => {
  it('round-trips to the recipient only', async () => {
    const alice = await generateKemKeyPair();
    const mallory = await generateKemKeyPair();
    const env = await sealTo(alice.publicKey, 'wrap', ctx, utf8('edk'));
    expect(
      new TextDecoder().decode(
        await openWith(alice.privateKey, 'wrap', ctx, env)
      )
    ).toBe('edk');
    await expect(
      openWith(mallory.privateKey, 'wrap', ctx, env)
    ).rejects.toMatchObject({ code: 'decrypt_failed' });
  });

  it('binds the context as info and aad', async () => {
    const alice = await generateKemKeyPair();
    const env = await sealTo(alice.publicKey, 'wrap', ctx, utf8('edk'));
    await expect(
      openWith(alice.privateKey, 'wrap', { ...ctx, epoch: 2 }, env)
    ).rejects.toMatchObject({ code: 'decrypt_failed' });
    await expect(
      openWith(alice.privateKey, 'value', ctx, env)
    ).rejects.toMatchObject({ code: 'decrypt_failed' });
    const otherEnc = (await sealTo(alice.publicKey, 'wrap', ctx, utf8('edk')))
      .enc;
    await expect(
      openWith(alice.privateKey, 'wrap', ctx, { ...env, enc: otherEnc })
    ).rejects.toMatchObject({ code: 'decrypt_failed' });
  });

  it('rejects malformed keys and round-trips its encoding', async () => {
    await expect(
      sealTo(new Uint8Array(31), 'wrap', ctx, utf8('x'))
    ).rejects.toMatchObject({ code: 'invalid_input' });
    const alice = await generateKemKeyPair();
    const env = await sealTo(alice.publicKey, 'wrap', ctx, utf8('x'));
    expect(decodeHpkeEnvelope(encodeHpkeEnvelope(env))).toEqual(env);
  });
});
