import { Aes128Gcm, CipherSuite } from '@hpke/core';
import { DhkemX25519HkdfSha256, HkdfSha256 } from '@hpke/dhkem-x25519';
import { ed25519 } from '@noble/curves/ed25519.js';
import { describe, expect, it } from 'vitest';
import { fromHex, toHex } from './bytes';
import { deriveKemKeyPair } from './hpke';
import { hkdfSha256 } from './kdf';

describe('RFC 5869 HKDF-SHA256', () => {
  it('matches test case 1', async () => {
    const okm = await hkdfSha256(
      fromHex('0b'.repeat(22)),
      fromHex('000102030405060708090a0b0c'),
      fromHex('f0f1f2f3f4f5f6f7f8f9'),
      42
    );
    expect(toHex(okm)).toBe(
      '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865'
    );
  });
});

describe('RFC 8032 Ed25519', () => {
  const cases = [
    {
      sk: '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60',
      pk: 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a',
      msg: '',
      sig: 'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b',
    },
    {
      sk: '4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb',
      pk: '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c',
      msg: '72',
      sig: '92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00',
    },
  ];
  it.each(cases)(
    'signs and verifies test vector $pk',
    ({ sk, pk, msg, sig }) => {
      expect(toHex(ed25519.getPublicKey(fromHex(sk)))).toBe(pk);
      expect(toHex(ed25519.sign(fromHex(msg), fromHex(sk)))).toBe(sig);
      expect(
        ed25519.verify(fromHex(sig), fromHex(msg), fromHex(pk), {
          zip215: false,
        })
      ).toBe(true);
    }
  );
});

describe('RFC 9180 HPKE A.1.1 (DHKEM X25519, HKDF-SHA256)', () => {
  const v = {
    info: '4f6465206f6e2061204772656369616e2055726e',
    ikmE: '7268600d403fce431561aef583ee1613527cff655c1343f29812e66706df3234',
    ikmR: '6db9df30aa07dd42ee5e8181afdb977e538f5e1fec8a06223f33f7013e525037',
    pkRm: '3948cfe0ad1ddb695d780e59077195da6c56506b027329794ab02bca80815c4d',
    skRm: '4612c550263fc8ad58375df3f557aac531d26850903e55a9f23f21d8534e8ac8',
    enc: '37fda3567bdbd628e88668c3c8d7e97d1d1253b6d4ea6d44c150f741f1bf4431',
    pt: '4265617574792069732074727574682c20747275746820626561757479',
    aad: '436f756e742d30',
    ct: 'f938558b5d72f1a23810b4be2ab4f84331acc02fc97babc53a52ae8218a355a96d8770ac83d07bea87e13c512a',
  };

  it('derives the recipient key pair', async () => {
    const pair = await deriveKemKeyPair(fromHex(v.ikmR));
    expect(toHex(pair.publicKey)).toBe(v.pkRm);
    expect(toHex(pair.privateKey)).toBe(v.skRm);
  });

  it('produces the vector encapsulation and first ciphertext', async () => {
    const suite = new CipherSuite({
      kem: new DhkemX25519HkdfSha256(),
      kdf: new HkdfSha256(),
      aead: new Aes128Gcm(),
    });
    const recipientPublicKey = await suite.kem.deserializePublicKey(
      fromHex(v.pkRm).buffer as ArrayBuffer
    );
    const sender = await suite.createSenderContext({
      recipientPublicKey,
      info: fromHex(v.info).buffer as ArrayBuffer,
      ekm: fromHex(v.ikmE).buffer as ArrayBuffer,
    });
    expect(toHex(new Uint8Array(sender.enc))).toBe(v.enc);
    const ct = await sender.seal(
      fromHex(v.pt).buffer as ArrayBuffer,
      fromHex(v.aad).buffer as ArrayBuffer
    );
    expect(toHex(new Uint8Array(ct))).toBe(v.ct);
  });
});
