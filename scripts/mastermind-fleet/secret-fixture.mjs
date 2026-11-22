// Builds the Mastermind secret entry byte fixture (secret-fixture.json) from
// fixed inputs. Node, Web, Swift and Dart tests check their bindings,
// signatures, MACs and plaintext encoding against it, so the four
// implementations cannot drift. Every value here is a disposable test value.
//   node scripts/mastermind-fleet/secret-fixture.mjs --write
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ANSWER_DOMAIN,
  b64url,
  bindingBytes,
  encodeSecretPlaintext,
  outcomeBytes,
  ownerKeyId,
  ownerTranscript,
  rawPublicKey,
  REQUEST_DOMAIN,
  requestCode,
  sha256Hex,
  signerFingerprint,
  signerFromSeed,
  signOutcome,
  signRequest,
} from './secret-protocol.mjs';
import {
  machineMac,
  newPairingCode,
  ownerMac,
  pairingKey,
  parsePairingCode,
} from './secret-pairing.mjs';
import { sign } from 'node:crypto';

const seed = (byte) => Buffer.alloc(32, byte);
const FIXTURE_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'secret-fixture.json'
);

export function buildSecretFixture() {
  const machine = signerFromSeed(seed(0x11));
  const owner = signerFromSeed(seed(0x22));
  const machineKey = b64url(rawPublicKey(machine));
  const ownerKeyRaw = rawPublicKey(owner);
  const keyId = ownerKeyId(ownerKeyRaw);
  // RFC 9180 A.2.1 pkRm, so the Swift self-test can open with skRm.
  const recipientPublicKey = Buffer.from(
    '4310ee97d88cc1f088a5576c77ab0cf5c3ac797f3d95139c6c84b5429c59662a',
    'hex'
  );
  const request = {
    v: '1',
    requestId: 'secret-0123456789abcdef01234567',
    machineId: 'skr-m4',
    requester: 'lane-0123456789abcdef',
    operation: 'studio-sudo',
    command: JSON.stringify({
      argv: [
        '/usr/bin/ssh',
        '-T',
        'macstudio1',
        '--',
        "'sudo' '-S' '-p' '' 'softwareupdate' '-ia' 'it'\\''s'",
      ],
      remote: ['sudo', '-S', '-p', '', 'softwareupdate', '-ia', "it's"],
    }),
    output: 'withheld',
    purpose: 'Mật khẩu sudo MacStudio1',
    expiresAt: '2026-11-22T10:10:00.000Z',
    publicKey: b64url(recipientPublicKey),
    signerKey: machineKey,
    audience: [keyId, 'ffffffffffffffffffffffffffffffff'].sort().join(','),
  };
  const answer = {
    action: 'secret',
    enc: b64url(Buffer.alloc(32, 0x33)),
    ct: b64url(Buffer.alloc(272, 0x44)),
    signedAt: '2026-11-22T10:05:00.000Z',
    keyId,
  };
  const transcript = ownerTranscript(request, answer);
  const decline = { ...answer, action: 'decline', enc: '', ct: '' };
  const codeBytes = Buffer.from('00112233445566778899', 'hex');
  const code = newPairingCode(codeBytes);
  const pairing = {
    pairingId: 'pair-0123456789abcdef01234567',
    machineId: 'skr-m4',
    machineLabel: 'Skora M4',
    signerKey: machineKey,
    ownerKey: b64url(ownerKeyRaw),
    expiresAt: '2026-11-22T10:10:00.000Z',
  };
  const key = pairingKey(parsePairingCode(code), pairing.pairingId);
  const plaintextValue = 'disposable-fixture-value';
  const answerDigest = sha256Hex(transcript);
  return {
    note: 'Disposable test values only. Regenerate with secret-fixture.mjs --write.',
    machineSeedHex: seed(0x11).toString('hex'),
    ownerSeedHex: seed(0x22).toString('hex'),
    ownerKey: b64url(ownerKeyRaw),
    ownerKeyId: keyId,
    request,
    requestBindingHex: bindingBytes(REQUEST_DOMAIN, request).toString('hex'),
    answerBindingHex: bindingBytes(ANSWER_DOMAIN, request).toString('hex'),
    requestSig: b64url(signRequest(machine, request)),
    requestCode: requestCode(request),
    machineFingerprint: signerFingerprint(rawPublicKey(machine)),
    answer,
    ownerTranscriptHex: transcript.toString('hex'),
    ownerSig: b64url(sign(null, transcript, owner)),
    declineTranscriptHex: ownerTranscript(request, decline).toString('hex'),
    answerDigest,
    outcome: {
      outcome: 'delivered',
      answerDigest,
      bytesHex: outcomeBytes(
        request.requestId,
        'delivered',
        answerDigest
      ).toString('hex'),
      sig: b64url(
        signOutcome(machine, request.requestId, 'delivered', answerDigest)
      ),
    },
    pairing: {
      ...pairing,
      code,
      codeHex: codeBytes.toString('hex'),
      keyHex: key.toString('hex'),
      machineMac: b64url(machineMac(key, pairing)),
      ownerMac: b64url(ownerMac(key, pairing)),
    },
    plaintext: {
      value: plaintextValue,
      hex: encodeSecretPlaintext(Buffer.from(plaintextValue, 'utf8')).toString(
        'hex'
      ),
    },
  };
}

export const fixtureText = () =>
  `${JSON.stringify(buildSecretFixture(), null, 2)}\n`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--write'))
    fs.writeFileSync(FIXTURE_FILE, fixtureText());
  else process.stdout.write(fixtureText());
}
