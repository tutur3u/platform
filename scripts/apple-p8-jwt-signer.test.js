const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  APPLE_AUDIENCE,
  DEFAULT_EXPIRES_IN_SECONDS,
  buildAppleClientSecret,
  decodeJwt,
  main,
  parseArgs,
} = require('./apple-p8-jwt-signer.js');

function createEcKeyPair() {
  return crypto.generateKeyPairSync('ec', {
    namedCurve: 'P-256',
    privateKeyEncoding: {
      format: 'pem',
      type: 'pkcs8',
    },
    publicKeyEncoding: {
      format: 'pem',
      type: 'spki',
    },
  });
}

test('parseArgs captures signer options', () => {
  const parsed = parseArgs([
    '--team-id',
    'TEAM123456',
    '--client-id',
    'com.example.app',
    '--key-id',
    'KEY1234567',
    '--p8-file',
    './AuthKey_KEY1234567.p8',
    '--expires-in-seconds',
    '120',
    '--json',
  ]);

  assert.deepEqual(parsed, {
    clientId: 'com.example.app',
    expiresInSeconds: '120',
    json: true,
    keyId: 'KEY1234567',
    p8File: './AuthKey_KEY1234567.p8',
    teamId: 'TEAM123456',
  });
});

test('buildAppleClientSecret signs an Apple-compatible ES256 JWT', () => {
  const { privateKey, publicKey } = createEcKeyPair();
  const nowSeconds = 1_700_000_000;
  const result = buildAppleClientSecret({
    teamId: 'TEAM123456',
    clientId: 'com.example.app',
    keyId: 'KEY1234567',
    privateKey,
    nowSeconds,
  });

  const [encodedHeader, encodedPayload, encodedSignature] =
    result.token.split('.');
  const signedContent = `${encodedHeader}.${encodedPayload}`;
  const signature = Buffer.from(
    encodedSignature.replace(/-/g, '+').replace(/_/g, '/'),
    'base64'
  );

  assert.equal(
    crypto.verify(
      'sha256',
      Buffer.from(signedContent, 'utf8'),
      {
        key: publicKey,
        dsaEncoding: 'ieee-p1363',
      },
      signature
    ),
    true
  );

  const decoded = decodeJwt(result.token);
  assert.deepEqual(decoded.header, {
    alg: 'ES256',
    kid: 'KEY1234567',
    typ: 'JWT',
  });
  assert.deepEqual(decoded.payload, {
    aud: APPLE_AUDIENCE,
    exp: nowSeconds + DEFAULT_EXPIRES_IN_SECONDS,
    iat: nowSeconds,
    iss: 'TEAM123456',
    sub: 'com.example.app',
  });
});

test('main prints JSON metadata and uses the 6 month default', () => {
  const { privateKey } = createEcKeyPair();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apple-jwt-signer-'));
  const keyPath = path.join(tempDir, 'AuthKey_TEST.p8');
  fs.writeFileSync(keyPath, privateKey);

  const stdout = [];
  const stderr = [];
  const exitCode = main(
    [
      '--team-id',
      'TEAM123456',
      '--client-id',
      'com.example.app',
      '--key-id',
      'KEY1234567',
      '--p8-file',
      keyPath,
      '--json',
    ],
    { write: (value) => stdout.push(value) },
    { write: (value) => stderr.push(value) }
  );

  assert.equal(exitCode, 0);
  assert.deepEqual(stderr, []);

  const output = JSON.parse(stdout.join(''));
  assert.equal(output.expiresInSeconds, DEFAULT_EXPIRES_IN_SECONDS);
  assert.equal(typeof output.token, 'string');
  assert.match(output.expiresAt, /\.\d{3}Z$/);
});
