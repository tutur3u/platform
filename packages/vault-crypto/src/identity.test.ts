import { describe, expect, it } from 'vitest';
import { randomBytes } from './bytes';
import { generateKemKeyPair } from './hpke';
import { assertInviteMac, inviteMac } from './invite';
import {
  deriveKek,
  displayFingerprint,
  fingerprint,
  PASSKEY_PRF_INPUT,
} from './keys';
import {
  assertFragmentMatches,
  createPairingFragment,
  decodePairingFragment,
  encodePairingFragment,
  transcriptHash,
} from './pairing';
import {
  confirmationGroup,
  formatRecoveryKey,
  generateRecoveryKey,
  parseRecoveryKey,
} from './recovery';
import {
  assertSignature,
  generateSigningKeyPair,
  signObject,
  verifyObject,
} from './signing';

const L = (1n << 252n) + 27742317777372353535851937790883648493n;

function addLToS(signature: Uint8Array): Uint8Array {
  const out = signature.slice();
  let s = 0n;
  for (let i = 31; i >= 0; i--) s = (s << 8n) | BigInt(out[32 + i] ?? 0);
  s += L;
  for (let i = 0; i < 32; i++) {
    out[32 + i] = Number(s & 0xffn);
    s >>= 8n;
  }
  return out;
}

describe('signatures', () => {
  const obj = { deployment: 'test', seq: 1, payload: new Uint8Array([1, 2]) };

  it('verifies only the signed object and purpose', () => {
    const pair = generateSigningKeyPair();
    const sig = signObject(pair.secretKey, 'record', obj);
    expect(verifyObject(pair.publicKey, 'record', obj, sig)).toBe(true);
    expect(verifyObject(pair.publicKey, 'key-log', obj, sig)).toBe(false);
    expect(
      verifyObject(pair.publicKey, 'record', { ...obj, seq: 2 }, sig)
    ).toBe(false);
    expect(
      verifyObject(generateSigningKeyPair().publicKey, 'record', obj, sig)
    ).toBe(false);
    expect(() =>
      assertSignature(pair.publicKey, 'record', { ...obj, seq: 2 }, sig)
    ).toThrow();
  });

  it('rejects a malleated signature (s + L)', () => {
    const pair = generateSigningKeyPair();
    const sig = signObject(pair.secretKey, 'record', obj);
    expect(verifyObject(pair.publicKey, 'record', obj, addLToS(sig))).toBe(
      false
    );
  });

  it('rejects malformed lengths without throwing', () => {
    const pair = generateSigningKeyPair();
    expect(
      verifyObject(pair.publicKey, 'record', obj, new Uint8Array(63))
    ).toBe(false);
    expect(
      verifyObject(new Uint8Array(31), 'record', obj, new Uint8Array(64))
    ).toBe(false);
  });
});

describe('key derivation', () => {
  const unlock = {
    vault_user_id: new Uint8Array(16).fill(1),
    identity_tier: 'strong' as const,
    method_id: new Uint8Array(16).fill(2),
    params_version: 1,
  };

  it('separates methods, contexts and salts', async () => {
    const ikm = randomBytes(32);
    const salt = randomBytes(16);
    const a = await deriveKek('passkey', ikm, salt, unlock);
    expect(await deriveKek('passkey', ikm, salt, unlock)).toEqual(a);
    expect(await deriveKek('recovery', ikm, salt, unlock)).not.toEqual(a);
    expect(
      await deriveKek('passkey', ikm, randomBytes(16), unlock)
    ).not.toEqual(a);
    expect(
      await deriveKek('passkey', ikm, salt, {
        ...unlock,
        method_id: new Uint8Array(16),
      })
    ).not.toEqual(a);
  });

  it('keeps the PIN tier separate and rejects weak input', async () => {
    await expect(
      deriveKek('pin', randomBytes(32), randomBytes(16), unlock)
    ).rejects.toThrow();
    await expect(
      deriveKek('passkey', randomBytes(31), randomBytes(16), unlock)
    ).rejects.toThrow();
  });

  it('uses a constant PRF input', () => {
    expect(PASSKEY_PRF_INPUT).toHaveLength(32);
  });
});

describe('recovery keys', () => {
  it('formats, parses and confirms', () => {
    const key = generateRecoveryKey();
    const text = formatRecoveryKey(key);
    expect(text.split('-')).toHaveLength(13);
    expect(parseRecoveryKey(text)).toEqual(key);
    expect(parseRecoveryKey(text.toLowerCase().replace(/-/g, ' '))).toEqual(
      key
    );
    expect(confirmationGroup(text, 4)).toHaveLength(4);
    expect(() => parseRecoveryKey(text.slice(0, -2))).toThrow();
  });
});

describe('invites', () => {
  const context = {
    deployment: 'test',
    vault_id: new Uint8Array(32).fill(3),
    invite_id: new Uint8Array(16).fill(4),
    recipient_user_id: 'user-1',
    recipient_email_hash: new Uint8Array(32).fill(5),
    environments: ['env-1'],
    level: 'reader',
    expires_at: 1_800_000_000,
  };
  const keys = {
    encryption_key: new Uint8Array(32).fill(6),
    signing_key: new Uint8Array(32).fill(7),
  };

  it('binds the secret, context and keys', () => {
    const secret = randomBytes(32);
    const mac = inviteMac(secret, context, keys);
    expect(() => assertInviteMac(secret, context, keys, mac)).not.toThrow();
    expect(() =>
      assertInviteMac(randomBytes(32), context, keys, mac)
    ).toThrow();
    expect(() =>
      assertInviteMac(secret, { ...context, level: 'admin' }, keys, mac)
    ).toThrow();
    expect(() =>
      assertInviteMac(
        secret,
        context,
        { ...keys, signing_key: new Uint8Array(32) },
        mac
      )
    ).toThrow();
  });
});

describe('fragment pairing', () => {
  it('accepts the device keys and rejects substituted keys', async () => {
    const device = {
      encryption_key: (await generateKemKeyPair()).publicKey,
      signing_key: generateSigningKeyPair().publicKey,
    };
    const requestId = randomBytes(16);
    const fragment = createPairingFragment(requestId, device);
    const decoded = decodePairingFragment(encodePairingFragment(fragment));
    expect(decoded).toEqual(fragment);
    expect(() =>
      assertFragmentMatches(decoded, requestId, device)
    ).not.toThrow();
    const attacker = {
      ...device,
      encryption_key: (await generateKemKeyPair()).publicKey,
    };
    expect(() => assertFragmentMatches(decoded, requestId, attacker)).toThrow();
    expect(() =>
      assertFragmentMatches(decoded, randomBytes(16), device)
    ).toThrow();
    expect(() => decodePairingFragment('not*base64')).toThrow();
  });

  it('hashes transcripts deterministically', () => {
    const t = { request_id: new Uint8Array(16), not_after: 1, level: 'reader' };
    expect(transcriptHash(t)).toEqual(
      transcriptHash({
        level: 'reader',
        not_after: 1,
        request_id: new Uint8Array(16),
      })
    );
    expect(transcriptHash(t)).not.toEqual(
      transcriptHash({ ...t, level: 'admin' })
    );
  });
});

describe('fingerprints', () => {
  it('separates key kinds and displays 128 bits', () => {
    const key = new Uint8Array(32).fill(9);
    expect(fingerprint('x25519', key)).not.toEqual(fingerprint('ed25519', key));
    expect(
      displayFingerprint(fingerprint('x25519', key)).replace(/-/g, '')
    ).toHaveLength(26);
  });
});
