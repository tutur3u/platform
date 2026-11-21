import { Aes256Gcm, CipherSuite } from '@hpke/core';
import { DhkemX25519HkdfSha256, HkdfSha256 } from '@hpke/dhkem-x25519';
import { ed25519 } from '@noble/curves/ed25519.js';
import { describe, expect, it } from 'vitest';
import { fromHex, randomBytes, toHex, utf8 } from './bytes';
import { encodeCanonical } from './canonical';
import { contextBytes } from './context';
import { deriveKemKeyPair, generateKemKeyPair, openWith, sealTo } from './hpke';
import { inviteMac } from './invite';
import { deriveKek } from './keys';
import { decodePairingFragment } from './pairing';
import { signObject, verifyObject } from './signing';

const ENC_ID = new Uint8Array(16).fill(0x11);
// Written out by hand: label ‖ 0x00 ‖ CBOR({a: 1, enc_id: h'11…11'}).
const VALUE_CONTEXT_HEX =
  toHex(utf8('tuturuuu/vault/value/v1')) +
  '00' +
  'a2' +
  '6161' +
  '01' +
  '66656e635f6964' +
  '50' +
  '11'.repeat(16);

describe('frozen wire formats', () => {
  it('lays out context bytes exactly', () => {
    expect(toHex(contextBytes('value', { a: 1, enc_id: ENC_ID }))).toBe(
      VALUE_CONTEXT_HEX
    );
  });

  it('opens an AES-256-GCM HPKE message built independently of the wrapper', async () => {
    const suite = new CipherSuite({
      kem: new DhkemX25519HkdfSha256(),
      kdf: new HkdfSha256(),
      aead: new Aes256Gcm(),
    });
    const recipient = await deriveKemKeyPair(new Uint8Array(32).fill(0x22));
    const ctx = fromHex(VALUE_CONTEXT_HEX).buffer as ArrayBuffer;
    const sender = await suite.createSenderContext({
      recipientPublicKey: await suite.kem.deserializePublicKey(
        recipient.publicKey.slice().buffer
      ),
      info: ctx,
    });
    const ct = await sender.seal(utf8('interop').slice().buffer, ctx);
    const pt = await openWith(
      recipient.privateKey,
      'value',
      { a: 1 },
      {
        v: 1,
        suite: 1,
        enc_id: ENC_ID,
        enc: new Uint8Array(sender.enc),
        ct: new Uint8Array(ct),
      }
    );
    expect(new TextDecoder().decode(pt)).toBe('interop');
  });

  it('signs the labelled context bytes with Ed25519', () => {
    const sk = fromHex(
      '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60'
    );
    const sig = signObject(sk, 'value', { a: 1, enc_id: ENC_ID });
    const pk = ed25519.getPublicKey(sk);
    expect(
      ed25519.verify(sig, fromHex(VALUE_CONTEXT_HEX), pk, { zip215: false })
    ).toBe(true);
    expect(verifyObject(pk, 'value', { a: 1, enc_id: ENC_ID }, sig)).toBe(true);
  });

  it('freezes the invite MAC layout: HMAC(secret, label ‖ 0x00 ‖ CBOR({context, keys}))', async () => {
    const { hmac } = await import('@noble/hashes/hmac.js');
    const { sha256 } = await import('@noble/hashes/sha2.js');
    const secret = new Uint8Array(32).fill(0x33);
    const context = {
      deployment: 'test',
      vault_id: new Uint8Array(32).fill(1),
      invite_id: new Uint8Array(16).fill(2),
      recipient_user_id: 'u',
      recipient_email_hash: new Uint8Array(32).fill(3),
      environments: ['e'],
      level: 'reader',
      expires_at: 1,
    };
    const keys = {
      encryption_key: new Uint8Array(32).fill(4),
      signing_key: new Uint8Array(32).fill(5),
    };
    const expected = hmac(
      sha256,
      secret,
      new Uint8Array([
        ...utf8('tuturuuu/vault/invite/v1'),
        0,
        ...encodeCanonical({ context, keys }),
      ])
    );
    expect(toHex(inviteMac(secret, context, keys))).toBe(toHex(expected));
  });
});

describe('input hardening', () => {
  it('rejects lone surrogates in strings and keys', () => {
    expect(() => encodeCanonical({ a: '\uD800' })).toThrow();
    expect(() => encodeCanonical({ a: 'x\uDC00' })).toThrow();
    expect(() => encodeCanonical({ ['\uD800']: 1 })).toThrow();
    expect(() => encodeCanonical({ a: '😀' })).not.toThrow();
    expect(() => contextBytes('value', { a: '\uD800' })).toThrow();
  });

  it('binds deployment and the exact method-tier pairs in KEKs', async () => {
    const base = {
      deployment: 'test',
      vault_user_id: new Uint8Array(16).fill(1),
      identity_tier: 'strong' as const,
      method_id: new Uint8Array(16).fill(2),
      params_version: 1,
    };
    const ikm = randomBytes(32);
    const salt = randomBytes(16);
    const a = await deriveKek('recovery', ikm, salt, base);
    expect(
      await deriveKek('recovery', ikm, salt, { ...base, deployment: 'other' })
    ).not.toEqual(a);
    await expect(
      deriveKek('recovery', ikm, salt, { ...base, identity_tier: 'pin' })
    ).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(
      deriveKek('passkey', ikm, salt, {
        ...base,
        identity_tier: 'other' as never,
      })
    ).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it('rejects low-order X25519 keys on seal and a low-order enc on open', async () => {
    await expect(
      sealTo(new Uint8Array(32), 'wrap', { a: 1 }, utf8('x'))
    ).rejects.toMatchObject({ code: 'invalid_input' });
    const alice = await generateKemKeyPair();
    const env = await sealTo(alice.publicKey, 'wrap', { a: 1 }, utf8('x'));
    await expect(
      openWith(
        alice.privateKey,
        'wrap',
        { a: 1 },
        { ...env, enc: new Uint8Array(32) }
      )
    ).rejects.toMatchObject({ code: 'decrypt_failed' });
  });

  it('accepts one spelling of a pairing fragment and maps bad input', () => {
    expect(() => decodePairingFragment('A')).toThrow(
      expect.objectContaining({ code: 'invalid_input' })
    );
    // 'AB' and 'AA' decode to the same byte once unused bits are dropped.
    expect(() => decodePairingFragment('AB')).toThrow(
      expect.objectContaining({ code: 'invalid_input' })
    );
  });
});
