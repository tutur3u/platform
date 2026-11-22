import assert from 'node:assert/strict';
import { randomBytes, sign } from 'node:crypto';
import fs from 'node:fs';
import { test } from 'node:test';
import { fixtureText } from './secret-fixture.mjs';
import {
  ANSWER_DOMAIN,
  b64url,
  bindingBytes,
  decodeSecretPlaintext,
  encodeSecretPlaintext,
  fromB64url,
  lengthPrefixed,
  outcomeBytes,
  ownerKeyId,
  ownerTranscript,
  rawPublicKey,
  REQUEST_DOMAIN,
  requestCode,
  sealedShapeOk,
  signerFingerprint,
  signerFromSeed,
  signOutcome,
  signRequest,
  verifyEd25519,
  verifyRequest,
} from './secret-protocol.mjs';

const fixtureFile = new URL('./secret-fixture.json', import.meta.url);
const fixture = JSON.parse(fs.readFileSync(fixtureFile, 'utf8'));
const flip = (buffer, index) => {
  const copy = Buffer.from(buffer);
  copy[index] ^= 0x01;
  return copy;
};

test('the committed fixture matches what the protocol code builds', () => {
  assert.equal(fs.readFileSync(fixtureFile, 'utf8'), fixtureText());
});

test('binding bytes are length-prefixed UTF-8 in protocol order', () => {
  const bytes = lengthPrefixed('d', ['', 'ab', 'ậ']);
  assert.equal(
    bytes.toString('hex'),
    '0000000164' + '00000000' + '000000026162' + '00000003e1baad'
  );
  assert.throws(() => lengthPrefixed('d', [1]), /secret_binding_field/);
  assert.throws(
    () => bindingBytes(REQUEST_DOMAIN, { ...fixture.request, v: 1 }),
    /secret_binding_field/
  );
  // Moving a byte between neighbouring fields changes the binding.
  assert.notDeepEqual(
    bindingBytes(ANSWER_DOMAIN, {
      ...fixture.request,
      machineId: 'ab',
      requester: 'c',
    }),
    bindingBytes(ANSWER_DOMAIN, {
      ...fixture.request,
      machineId: 'a',
      requester: 'bc',
    })
  );
  assert.notDeepEqual(
    bindingBytes(ANSWER_DOMAIN, fixture.request),
    bindingBytes(REQUEST_DOMAIN, fixture.request)
  );
});

test('the machine signature covers every request field', () => {
  const signature = fromB64url(fixture.requestSig, 64);
  assert.equal(verifyRequest(fixture.request, signature), true);
  for (const field of Object.keys(fixture.request)) {
    if (field === 'signerKey') continue;
    assert.equal(
      verifyRequest(
        { ...fixture.request, [field]: `${fixture.request[field]}x` },
        signature
      ),
      false,
      field
    );
  }
  const other = signerFromSeed(randomBytes(32));
  assert.equal(
    verifyRequest(
      { ...fixture.request, signerKey: b64url(rawPublicKey(other)) },
      signature
    ),
    false
  );
  assert.equal(verifyRequest(fixture.request, flip(signature, 7)), false);
  assert.equal(
    verifyRequest(fixture.request, signature.subarray(0, 63)),
    false
  );
  const signer = signerFromSeed(Buffer.from(fixture.machineSeedHex, 'hex'));
  assert.deepEqual(signRequest(signer, fixture.request), signature);
});

test('the owner signature covers the request, action, payload, time and key', () => {
  const owner = signerFromSeed(Buffer.from(fixture.ownerSeedHex, 'hex'));
  const ownerRaw = rawPublicKey(owner);
  assert.equal(ownerKeyId(ownerRaw), fixture.ownerKeyId);
  const signature = fromB64url(fixture.ownerSig, 64);
  const transcript = ownerTranscript(fixture.request, fixture.answer);
  assert.equal(verifyEd25519(ownerRaw, transcript, signature), true);
  for (const [field, value] of Object.entries({
    action: 'decline',
    enc: b64url(randomBytes(32)),
    ct: b64url(randomBytes(272)),
    signedAt: '2026-11-22T10:05:00.001Z',
    keyId: '0'.repeat(32),
  }))
    assert.equal(
      verifyEd25519(
        ownerRaw,
        ownerTranscript(fixture.request, { ...fixture.answer, [field]: value }),
        signature
      ),
      false,
      field
    );
  assert.equal(
    verifyEd25519(
      ownerRaw,
      ownerTranscript({ ...fixture.request, command: '[]' }, fixture.answer),
      signature
    ),
    false
  );
  assert.equal(
    verifyEd25519(
      fromB64url(fixture.request.signerKey, 32),
      transcript,
      signature
    ),
    false
  );
  assert.throws(() =>
    ownerTranscript(fixture.request, { ...fixture.answer, enc: undefined })
  );
});

test('outcome signatures bind the request, outcome and winning answer', () => {
  const machine = signerFromSeed(Buffer.from(fixture.machineSeedHex, 'hex'));
  const raw = rawPublicKey(machine);
  const { outcome, answerDigest, sig } = fixture.outcome;
  const signature = fromB64url(sig, 64);
  const id = fixture.request.requestId;
  assert.equal(
    verifyEd25519(raw, outcomeBytes(id, outcome, answerDigest), signature),
    true
  );
  assert.equal(
    verifyEd25519(raw, outcomeBytes(id, 'failed', answerDigest), signature),
    false
  );
  assert.equal(
    verifyEd25519(raw, outcomeBytes(id, outcome, ''), signature),
    false
  );
  assert.equal(
    verifyEd25519(
      raw,
      outcomeBytes('secret-other', outcome, answerDigest),
      signature
    ),
    false
  );
  assert.throws(() => signOutcome(machine, id, 'approved'), /secret_outcome/);
});

test('plaintext pads to the smallest 256-byte bucket and decodes strictly', () => {
  const encode = (text) => encodeSecretPlaintext(Buffer.from(text, 'utf8'));
  assert.equal(encode('a').length, 256);
  assert.equal(encode('a'.repeat(253)).length, 256);
  assert.equal(encode('a'.repeat(254)).length, 512);
  assert.equal(encode('a'.repeat(4096)).length, 17 * 256);
  assert.throws(() => encode(''), /secret_value_length/);
  assert.throws(() => encode('a'.repeat(4097)), /secret_value_length/);
  assert.equal(
    encode(fixture.plaintext.value).toString('hex'),
    fixture.plaintext.hex
  );
  assert.equal(
    decodeSecretPlaintext(encode('mật khẩu')).toString('utf8'),
    'mật khẩu'
  );
  const good = encode('value');
  const withLength = (n) => {
    const b = Buffer.from(good);
    b.writeUInt16BE(n, 1);
    return b;
  };
  const bad = {
    version: Buffer.concat([Buffer.from([2]), good.subarray(1)]),
    padding: flip(good, 200),
    tooLong: withLength(300),
    zero: withLength(0),
    biggerBucket: Buffer.concat([good, Buffer.alloc(256)]),
    notBucket: good.subarray(0, 255),
    over17: Buffer.concat([encode('a'.repeat(4096)), Buffer.alloc(256)]),
    utf8: (() => {
      const b = Buffer.from(good);
      b[3] = 0xff;
      return b;
    })(),
  };
  for (const [name, value] of Object.entries(bad))
    assert.throws(() => decodeSecretPlaintext(value), /secret_plaintext/, name);
});

test('sealed shapes are the buckets the relay also checks', () => {
  const enc = Buffer.alloc(32);
  assert.equal(sealedShapeOk(enc, Buffer.alloc(256 + 16)), true);
  assert.equal(sealedShapeOk(enc, Buffer.alloc(17 * 256 + 16)), true);
  assert.equal(sealedShapeOk(enc, Buffer.alloc(18 * 256 + 16)), false);
  assert.equal(sealedShapeOk(enc, Buffer.alloc(255 + 16)), false);
  assert.equal(sealedShapeOk(Buffer.alloc(31), Buffer.alloc(272)), false);
});

test('base64url is canonical and length checked', () => {
  const bytes = randomBytes(32);
  const text = b64url(bytes);
  assert.deepEqual(fromB64url(text, 32), bytes);
  assert.equal(fromB64url(text, 31), null);
  assert.equal(fromB64url(`${text}=`, 32), null);
  assert.equal(fromB64url('a+b/', 3), null);
  assert.equal(fromB64url(undefined, 32), null);
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const index = alphabet.indexOf(text.at(-1));
  const sibling = alphabet[(index & ~0b11) | ((index + 1) & 0b11)];
  assert.equal(fromB64url(`${text.slice(0, -1)}${sibling}`, 32), null);
});

test('display codes are short and bound to the request', () => {
  assert.equal(requestCode(fixture.request), fixture.requestCode);
  assert.match(fixture.requestCode, /^[0-9A-F]{4}-[0-9A-F]{4}$/);
  assert.notEqual(
    requestCode({ ...fixture.request, purpose: 'Another purpose' }),
    fixture.requestCode
  );
  assert.equal(
    signerFingerprint(fromB64url(fixture.request.signerKey, 32)),
    fixture.machineFingerprint
  );
  assert.match(fixture.machineFingerprint, /^[0-9A-F]{8}( [0-9A-F]{8}){3}$/);
});

test('owner signatures made elsewhere verify the same way', () => {
  const owner = signerFromSeed(randomBytes(32));
  const message = Buffer.from('any transcript');
  assert.equal(
    verifyEd25519(rawPublicKey(owner), message, sign(null, message, owner)),
    true
  );
  assert.equal(
    verifyEd25519(Buffer.alloc(31), message, Buffer.alloc(64)),
    false
  );
});
