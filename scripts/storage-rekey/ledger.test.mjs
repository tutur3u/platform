import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  acquireLock,
  canTransition,
  consumeApproval,
  issueApproval,
  loadLedger,
  mergeSelection,
  planDigest,
  saveLedger,
  transition,
} from './ledger.mjs';

const scope = { projectRef: 'ref', environment: 'staging', bucket: 'workspaces' };

function tempLedger(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rekey-ledger-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, 'ledger.json');
}

function row(id, extra = {}) {
  return { id, root: 'chats', wsId: 'ws', name: `ws/chats/c/${id}.txt`, updatedAt: 't0', size: 1, mimetype: 'text/plain', ...extra };
}

test('forward path is the only way to old_deleted', () => {
  assert.ok(canTransition('selected', 'copied'));
  assert.ok(canTransition('copied', 'verified'));
  assert.ok(canTransition('verified', 'refs_updated'));
  assert.ok(canTransition('refs_updated', 'old_deleted'));
  assert.equal(canTransition('selected', 'old_deleted'), false);
  assert.equal(canTransition('copied', 'old_deleted'), false);
  assert.equal(canTransition('verified', 'old_deleted'), false);
  // Refs are committed only after verification.
  assert.equal(canTransition('copied', 'refs_updated'), false);
});

test('terminal states never move and old_deleted cannot be rolled back', () => {
  for (const state of ['old_deleted', 'skipped', 'rolled_back']) {
    for (const to of ['selected', 'copied', 'verified', 'refs_updated', 'old_deleted', 'failed', 'rolled_back']) {
      assert.equal(canTransition(state, to), false, `${state} -> ${to}`);
    }
  }
  assert.ok(canTransition('failed', 'rolled_back'));
  assert.equal(canTransition('failed', 'copied'), false);
});

test('transition records history and rejects illegal moves', () => {
  const ledger = loadLedger('/nonexistent/ledger.json', scope, { now: 't' });
  mergeSelection(ledger, [row('a')], { now: 't1' });
  const entry = ledger.objects.a;
  transition(entry, 'copied', { now: 't2', patch: { newId: 'n' } });
  assert.equal(entry.newId, 'n');
  assert.deepEqual(entry.history.map((h) => h.state), ['selected', 'copied']);
  assert.throws(() => transition(entry, 'old_deleted'), { code: 'ERR_LEDGER_TRANSITION' });
});

test('selection merge is idempotent and keeps skip reasons', () => {
  const ledger = loadLedger('/nonexistent/ledger.json', scope, { now: 't' });
  assert.equal(mergeSelection(ledger, [row('a'), row('b', { skipReason: 'chat_deleted' })], { now: 't' }), 2);
  ledger.objects.a.state = 'copied';
  assert.equal(mergeSelection(ledger, [row('a'), row('b')], { now: 't' }), 0);
  assert.equal(ledger.objects.a.state, 'copied');
  assert.equal(ledger.objects.b.state, 'skipped');
  assert.equal(ledger.objects.b.skipReason, 'chat_deleted');
  ledger.objects.a.newId = 'n1';
  ledger.objects.a.newName = 'ws/chats/c/uuid-a.txt';
  assert.equal(mergeSelection(ledger, [row('n1'), row('n2', { name: 'ws/chats/c/uuid-a.txt' })], { now: 't' }), 0, 'own copies are never re-selected');
});

test('ledger persists at mode 600 and refuses wider modes or other projects', (t) => {
  const file = tempLedger(t);
  const ledger = loadLedger(file, scope, { now: 't' });
  mergeSelection(ledger, [row('a')], { now: 't' });
  saveLedger(file, ledger);
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(loadLedger(file, scope).objects.a.state, 'selected');
  assert.throws(() => loadLedger(file, { ...scope, projectRef: 'prod' }), { code: 'ERR_LEDGER_SCOPE' });
  if (process.platform !== 'win32') {
    fs.chmodSync(file, 0o644);
    assert.throws(() => loadLedger(file, scope), { code: 'ERR_LEDGER_MODE' });
  }
});

test('one run at a time per ledger', (t) => {
  const file = tempLedger(t);
  const release = acquireLock(file);
  assert.throws(() => acquireLock(file), { code: 'ERR_LEDGER_LOCKED' });
  release();
  acquireLock(file)();
});

test('approval token is one-time and bound to the pending set', () => {
  const ledger = loadLedger('/nonexistent/ledger.json', scope, { now: 't' });
  mergeSelection(ledger, [row('a'), row('b')], { now: 't' });
  const token = issueApproval(ledger, 'chats', { now: 't' });
  assert.equal(JSON.stringify(ledger).includes(token), false, 'token value is never stored');
  assert.match(token, /^[0-9a-f]{36}$/);
  assert.throws(() => consumeApproval(ledger, 'chats', 'wrong'), { code: 'ERR_APPROVAL_TOKEN' });
  assert.throws(() => consumeApproval(ledger, 'mira/images', token), { code: 'ERR_APPROVAL_MISSING' });
  consumeApproval(ledger, 'chats', token, { now: 't2' });
  assert.throws(() => consumeApproval(ledger, 'chats', token), { code: 'ERR_APPROVAL_USED' });

  const fresh = issueApproval(ledger, 'chats', { now: 't3' });
  const before = planDigest(ledger, 'chats');
  mergeSelection(ledger, [row('c')], { now: 't4' });
  assert.notEqual(planDigest(ledger, 'chats'), before);
  assert.throws(() => consumeApproval(ledger, 'chats', fresh), { code: 'ERR_APPROVAL_STALE' });
});
