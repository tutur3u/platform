// Test world for the Mastermind secret entry machine flows: a temporary
// fleet-sync root, a paired owner key, an operations file, a stub
// `mm-secret-hpke` (no cryptography: it returns a fixed plaintext for one
// expected box) and a phone that signs answers. Disposable values only.
import { createPrivateKey, randomBytes, sign } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { addOwnerKey, machineKey, secretPaths } from './secret-machine.mjs';
import {
  b64url,
  encodeSecretPlaintext,
  ownerKeyId,
  ownerTranscript,
  rawPublicKey,
  signerFromSeed,
} from './secret-protocol.mjs';

export const STUB_ENC = b64url(Buffer.alloc(32, 7));
export const STUB_CT = b64url(Buffer.alloc(272, 9));
export const TEST_VALUE = 'disposable-test-value';

export function makeWorld({ operations } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-secret-'));
  const paths = secretPaths(home);
  for (const dir of [
    paths.binDir,
    paths.openDir,
    paths.answersDir,
    paths.resolvedDir,
  ])
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    paths.configFile,
    JSON.stringify({ machineId: 'test-mac', machineLabel: 'Test Mac' })
  );
  const received = path.join(home, 'received.bin');
  const writeOperations = (ops) =>
    fs.writeFileSync(
      paths.operationsFile,
      JSON.stringify({ version: 1, operations: ops }),
      {
        mode: 0o600,
      }
    );
  writeOperations(
    operations ?? {
      'test-stdin': {
        purpose: 'Test sudo password',
        argv: [
          process.execPath,
          '-e',
          `require('fs').writeFileSync(${JSON.stringify(received)}, require('fs').readFileSync(0))`,
        ],
        delivery: 'stdin',
        newline: true,
      },
      'test-fd3': {
        purpose: 'Test key file',
        argv: [
          process.execPath,
          '-e',
          `require('fs').writeFileSync(${JSON.stringify(received)}, require('fs').readFileSync(3))`,
        ],
        delivery: 'fd3',
      },
      'test-fail': {
        purpose: 'Test failing command',
        argv: [
          process.execPath,
          '-e',
          'require("fs").readFileSync(0); process.exit(9)',
        ],
        delivery: 'stdin',
      },
    }
  );
  const helper = writeStubHelper(paths);
  machineKey(paths, { create: true });
  const owner = signerFromSeed(randomBytes(32));
  const ownerRaw = rawPublicKey(owner);
  addOwnerKey(paths, ownerRaw);
  return {
    home,
    paths,
    received,
    helper,
    owner,
    ownerRaw,
    writeOperations,
    cleanup: () => fs.rmSync(home, { recursive: true, force: true }),
  };
}

/** A stub `serve`: a fixed public key, and the fixed plaintext for one box. */
function writeStubHelper(paths) {
  const config = {
    publicKey: b64url(Buffer.alloc(32, 5)),
    enc: STUB_ENC,
    ct: STUB_CT,
    plaintext: b64url(encodeSecretPlaintext(Buffer.from(TEST_VALUE))),
  };
  fs.writeFileSync(`${paths.helperFile}.json`, JSON.stringify(config));
  fs.writeFileSync(
    paths.helperFile,
    `#!${process.execPath}
const fs = require('node:fs');
const cfg = JSON.parse(fs.readFileSync(__filename + '.json', 'utf8'));
if (process.argv[2] === 'version') { console.log('{"protocol":"1"}'); process.exit(0); }
console.log(JSON.stringify({ publicKey: cfg.publicKey }));
const rl = require('node:readline').createInterface({ input: process.stdin });
rl.once('line', (line) => {
  fs.writeFileSync(__filename + '.seen', line);
  const m = JSON.parse(line);
  console.log(JSON.stringify(m.enc === cfg.enc && m.ct === cfg.ct ? { plaintext: cfg.plaintext } : { error: 'open_failed' }));
  process.exit(0);
});
rl.on('close', () => process.exit(0));
`,
    { mode: 0o700 }
  );
  return paths.helperFile;
}

/** The single open decision the helper published, once it exists. */
export async function openDecision(paths, prefix = 'secret-') {
  for (let i = 0; i < 1000; i++) {
    const name = fs
      .readdirSync(paths.openDir)
      .find((n) => n.startsWith(prefix));
    if (name)
      return JSON.parse(
        fs.readFileSync(path.join(paths.openDir, name), 'utf8')
      );
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('no open decision');
}

/** A phone answer, signed by `owner` unless told otherwise. */
export function signedAnswer(request, owner, overrides = {}) {
  const ownerRaw = rawPublicKey(owner);
  const action = overrides.action ?? 'secret';
  const sealed = action === 'secret' ? { enc: STUB_ENC, ct: STUB_CT } : null;
  const fields = {
    action,
    enc: sealed?.enc ?? '',
    ct: sealed?.ct ?? '',
    signedAt: overrides.signedAt ?? new Date().toISOString(),
    keyId: ownerKeyId(ownerRaw),
  };
  const signer = overrides.signWith ?? owner;
  return {
    decisionId: request.requestId,
    action,
    ...(sealed ? { sealed } : {}),
    owner: {
      publicKey: b64url(ownerRaw),
      keyId: fields.keyId,
      signedAt: fields.signedAt,
      sig: b64url(sign(null, ownerTranscript(request, fields), signer)),
    },
  };
}

export function writeSpool(paths, id, revision, record) {
  fs.writeFileSync(
    path.join(paths.answersDir, `${id}.r${revision}.json`),
    JSON.stringify({ ...record, revision }),
    { mode: 0o600 }
  );
}

export const auditLines = (paths) =>
  fs.existsSync(paths.auditFile)
    ? fs
        .readFileSync(paths.auditFile, 'utf8')
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l))
    : [];

export const resolved = (paths, id) =>
  JSON.parse(
    fs.readFileSync(path.join(paths.resolvedDir, `${id}.json`), 'utf8')
  );

export const anotherOwner = () =>
  createPrivateKey({
    key: Buffer.concat([
      Buffer.from('302e020100300506032b657004220420', 'hex'),
      randomBytes(32),
    ]),
    format: 'der',
    type: 'pkcs8',
  });
