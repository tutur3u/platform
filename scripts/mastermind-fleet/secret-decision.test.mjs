import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { baseFleetState, readResolved } from './decision-extras.mjs';
import { parseDecision, readDecisions } from './publish.mjs';
import {
  commandOk,
  parseSecret,
  parseSecretOutcome,
} from './secret-decision.mjs';
import { purgeSecretSpools } from './secret-spool.mjs';

const fixture = JSON.parse(
  fs.readFileSync(new URL('./secret-fixture.json', import.meta.url), 'utf8')
);
const NOW = new Date('2026-11-22T10:00:00.000Z');
const requestDecision = (overrides = {}, secret = {}) => ({
  id: fixture.request.requestId,
  kind: 'secret',
  title: fixture.request.purpose,
  urgency: 'high',
  createdAt: '2026-11-22T09:55:00.000Z',
  deadlineAt: fixture.request.expiresAt,
  secret: {
    mode: 'request',
    ...fixture.request,
    sig: fixture.requestSig,
    ...secret,
  },
  ...overrides,
});
const pairDecision = (secret = {}) => {
  const {
    code: _c,
    codeHex: _h,
    keyHex: _k,
    ownerKey: _o,
    ownerMac: _m,
    ...pairing
  } = fixture.pairing;
  return {
    id: pairing.pairingId,
    kind: 'secret',
    title: 'Pair Skora M4',
    urgency: 'high',
    createdAt: '2026-11-22T10:00:00.000Z',
    deadlineAt: pairing.expiresAt,
    secret: { mode: 'pair', v: '1', ...pairing, ...secret },
  };
};

test('request and pair decisions pass through unchanged', () => {
  const request = parseDecision(requestDecision(), NOW);
  assert.equal(request.kind, 'secret');
  assert.deepEqual(request.secret, {
    mode: 'request',
    ...fixture.request,
    sig: fixture.requestSig,
  });
  assert.equal(request.title, fixture.request.purpose);
  const pair = parseDecision(pairDecision(), NOW);
  assert.equal(pair.secret.mode, 'pair');
  assert.equal(pair.secret.machineMac, fixture.pairing.machineMac);
});

test('signed text is never rewritten: anything the scrubber would change is dropped', () => {
  const bad = {
    idMismatch: requestDecision({ id: 'secret-ffffffffffffffffffffffff' }),
    purposeUrl: requestDecision({}, { purpose: 'See https://example.com/x' }),
    unsortedAudience: requestDecision(
      {},
      {
        audience: [...fixture.request.audience.split(',')].reverse().join(','),
      }
    ),
    badKey: requestDecision({}, { publicKey: 'short' }),
    badSig: requestDecision({}, { sig: fixture.request.publicKey }),
    badRequester: requestDecision({}, { requester: 'someone' }),
    badOutput: requestDecision({}, { output: 'log' }),
    badCommand: requestDecision({}, { command: '["/bin/sh"]' }),
    controlCommand: requestDecision(
      {},
      { command: JSON.stringify({ argv: ['/bin/echo', 'a\nb'] }) }
    ),
    version: requestDecision({}, { v: 1 }),
    tooLong: requestDecision({ createdAt: '2026-11-22T09:00:00.000Z' }),
  };
  for (const [name, decision] of Object.entries(bad))
    assert.equal(parseDecision(decision, NOW), null, name);
  assert.equal(
    parseDecision(pairDecision({ machineLabel: 'mail@example.com' }), NOW),
    null
  );
  assert.equal(
    parseDecision(
      pairDecision({ pairingId: 'pair-000000000000000000000000' }),
      NOW
    ),
    null
  );
});

test('an expired request is dropped', () => {
  assert.equal(
    parseSecret(requestDecision(), new Date(fixture.request.expiresAt)),
    null
  );
  assert.ok(
    parseSecret(
      requestDecision(),
      new Date(Date.parse(fixture.request.expiresAt) - 1)
    )
  );
});

test('commands are the bound argv or argv plus remote, nothing else', () => {
  assert.equal(commandOk(fixture.request.command), true);
  assert.equal(
    commandOk('["/usr/bin/true"]'),
    false,
    'bare arrays are not commands'
  );
  assert.equal(commandOk(JSON.stringify({ argv: ['/usr/bin/true'] })), true);
  assert.equal(
    commandOk(
      JSON.stringify({
        argv: ['/usr/bin/ssh', 'h', '--', "'a'"],
        remote: ['a'],
      })
    ),
    true
  );
  assert.equal(commandOk(JSON.stringify({ argv: [] })), false);
  assert.equal(commandOk(JSON.stringify({ argv: ['/x'], extra: 1 })), false);
  assert.equal(commandOk('x'.repeat(9000)), false);
});

test('secret decisions get their own budget and leave the v1 core', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-secret-pub-'));
  try {
    const base = requestDecision({}, {});
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    for (let i = 0; i < 12; i++) {
      const id = `secret-${String(i).padStart(24, '0')}`;
      fs.writeFileSync(
        path.join(dir, `${id}.json`),
        JSON.stringify({
          ...base,
          id,
          createdAt: new Date(Date.now() + i).toISOString(),
          secret: { ...base.secret, requestId: id, expiresAt: expires },
        })
      );
    }
    const { decisions } = readDecisions(dir);
    assert.equal(decisions.filter((d) => d.kind === 'secret').length, 10);
    const core = baseFleetState({
      decisions,
      lanes: [],
      machines: [],
      counts: {},
    });
    assert.equal(core.decisions.length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('resolved records carry a well-formed machine-signed outcome only', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-secret-res-'));
  try {
    const write = (id, extra) =>
      fs.writeFileSync(
        path.join(dir, `${id}.json`),
        JSON.stringify({
          id,
          kind: 'secret',
          title: 'Test',
          outcome: 'Delivered',
          resolvedAt: NOW.toISOString(),
          ...extra,
        })
      );
    write('secret-aaaaaaaaaaaaaaaaaaaaaaaa', {
      secretOutcome: fixture.outcome,
    });
    write('secret-bbbbbbbbbbbbbbbbbbbbbbbb', {
      secretOutcome: { ...fixture.outcome, outcome: 'approved' },
    });
    const rows = readResolved(dir, NOW);
    const good = rows.find((r) => r.id.startsWith('secret-a'));
    const bad = rows.find((r) => r.id.startsWith('secret-b'));
    assert.equal(good.kind, 'secret');
    assert.deepEqual(good.secretOutcome, {
      outcome: fixture.outcome.outcome,
      answerDigest: fixture.outcome.answerDigest,
      sig: fixture.outcome.sig,
    });
    assert.equal(bad.secretOutcome, undefined);
    assert.equal(
      parseSecretOutcome({ ...fixture.outcome, answerDigest: 'xyz' }),
      null
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the publisher purges secret spools older than ten minutes and nothing else', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-secret-spool-'));
  try {
    const names = [
      'secret-000000000000000000000000.r1.json',
      'pair-000000000000000000000000.r2.json',
      'iris-ask-1.r1.json',
      'secret-000000000000000000000001.r1.json',
    ];
    for (const name of names) fs.writeFileSync(path.join(dir, name), '{}');
    const old = new Date(Date.now() - 11 * 60 * 1000);
    for (const name of names.slice(0, 3))
      fs.utimesSync(path.join(dir, name), old, old);
    assert.equal(purgeSecretSpools(dir), 2);
    assert.deepEqual(fs.readdirSync(dir).sort(), [
      'iris-ask-1.r1.json',
      'secret-000000000000000000000001.r1.json',
    ]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
