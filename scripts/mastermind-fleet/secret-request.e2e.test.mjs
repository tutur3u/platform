// End to end on a macOS 14+ host with the real CryptoKit helper: the
// request is sealed by the same CryptoKit code the phone ships
// (mm-secret-seal-test), opened by mm-secret-hpke, and delivered to the
// command. Skipped unless MM_SECRET_HPKE_BIN and MM_SECRET_SEAL_BIN point
// at the binaries build.sh produced.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { afterEach, test } from 'node:test';
import { EXIT, runRequest } from './secret-flow.mjs';
import { verifyPlatform } from './secret-machine.mjs';
import {
  ANSWER_DOMAIN,
  b64url,
  bindingBytes,
  encodeSecretPlaintext,
  ownerKeyId,
  ownerTranscript,
} from './secret-protocol.mjs';
import { sign } from 'node:crypto';
import {
  makeWorld,
  openDecision,
  resolved,
  writeSpool,
} from './secret-test-world.mjs';

const helperBin = process.env.MM_SECRET_HPKE_BIN;
const sealBin = process.env.MM_SECRET_SEAL_BIN;
const skip =
  !(helperBin && sealBin) && 'set MM_SECRET_HPKE_BIN and MM_SECRET_SEAL_BIN';
let world;
afterEach(() => world?.cleanup());

function install(paths) {
  fs.copyFileSync(helperBin, paths.helperFile);
  fs.chmodSync(paths.helperFile, 0o755);
  const digest = createHash('sha256')
    .update(fs.readFileSync(paths.helperFile))
    .digest('hex');
  fs.writeFileSync(paths.helperDigestFile, `${digest}\n`, { mode: 0o644 });
  fs.chmodSync(paths.root, 0o700);
  fs.chmodSync(paths.binDir, 0o755);
}

const seal = (publicKey, aad, plaintext) =>
  JSON.parse(
    execFileSync(sealBin, {
      input: `${JSON.stringify({ publicKey, aad: b64url(aad), plaintext: b64url(plaintext) })}\n`,
      encoding: 'utf8',
    })
  );

test(
  'CryptoKit seal on the phone side opens in mm-secret-hpke and reaches only the command',
  { skip },
  async () => {
    world = makeWorld();
    install(world.paths);
    const helper = verifyPlatform(world.paths);
    const run = runRequest({
      paths: world.paths,
      operationId: 'test-stdin',
      checkPlatform: () => helper,
      pollMs: 20,
      print: () => {},
    });
    const { secret } = await openDecision(world.paths);
    const { mode: _m, sig: _s, ...request } = secret;
    const value = 'disposable e2e value with spaces and ậ';
    const sealed = seal(
      request.publicKey,
      bindingBytes(ANSWER_DOMAIN, request),
      encodeSecretPlaintext(Buffer.from(value, 'utf8'))
    );
    const signedAt = new Date().toISOString();
    const keyId = ownerKeyId(world.ownerRaw);
    const transcript = ownerTranscript(request, {
      action: 'secret',
      ...sealed,
      signedAt,
      keyId,
    });
    writeSpool(world.paths, request.requestId, 1, {
      decisionId: request.requestId,
      action: 'secret',
      sealed,
      owner: {
        publicKey: b64url(world.ownerRaw),
        keyId,
        signedAt,
        sig: b64url(sign(null, transcript, world.owner)),
      },
    });
    assert.equal(await run, EXIT.ok);
    assert.equal(fs.readFileSync(world.received, 'utf8'), `${value}\n`);
    assert.equal(
      resolved(world.paths, request.requestId).secretOutcome.outcome,
      'delivered'
    );
  }
);

test(
  'a box sealed under a changed binding fails to open',
  { skip },
  async () => {
    world = makeWorld();
    install(world.paths);
    const helper = verifyPlatform(world.paths);
    const run = runRequest({
      paths: world.paths,
      operationId: 'test-stdin',
      checkPlatform: () => helper,
      pollMs: 20,
      print: () => {},
    });
    const { secret } = await openDecision(world.paths);
    const { mode: _m, sig: _s, ...request } = secret;
    const sealed = seal(
      request.publicKey,
      bindingBytes(ANSWER_DOMAIN, { ...request, purpose: 'Something else' }),
      encodeSecretPlaintext(Buffer.from('disposable', 'utf8'))
    );
    const signedAt = new Date().toISOString();
    const keyId = ownerKeyId(world.ownerRaw);
    const transcript = ownerTranscript(request, {
      action: 'secret',
      ...sealed,
      signedAt,
      keyId,
    });
    writeSpool(world.paths, request.requestId, 1, {
      decisionId: request.requestId,
      action: 'secret',
      sealed,
      owner: {
        publicKey: b64url(world.ownerRaw),
        keyId,
        signedAt,
        sig: b64url(sign(null, transcript, world.owner)),
      },
    });
    assert.equal(await run, EXIT.notDelivered);
    assert.equal(fs.existsSync(world.received), false);
  }
);
