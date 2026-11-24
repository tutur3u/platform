import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  AttachmentError,
  downloadObject,
  openSpool,
  storeOrigin,
  writeAll,
} from './attachment-spool.mjs';
import { fakeStore, manifestFile } from './bridge-attach-test-fixture.mjs';
import { tempDir, uuid } from './bridge-test-fixture.mjs';

const ORIGIN = 'https://store.example';
const REPLY = uuid(1);
const bytes = Buffer.from('hello attachment', 'utf8');
const mode = (file) => fs.statSync(file).mode & 0o777;

async function code(run) {
  try {
    await run();
    return 'ok';
  } catch (error) {
    return error instanceof AttachmentError
      ? error.code
      : `other:${error?.code}`;
  }
}

test('the spool is a private directory of exclusive 0600 files with generated names', () => {
  const root = tempDir();
  const dir = path.join(root, 'attachment-spool');
  fs.mkdirSync(dir, { mode: 0o755 });
  fs.chmodSync(dir, 0o755);
  const spool = openSpool(dir);
  assert.equal(mode(dir), 0o700);
  const { name, fd } = spool.create(REPLY, 0);
  fs.closeSync(fd);
  assert.match(
    name,
    /^00000000-0000-4000-8000-000000000001\.0\.[0-9a-f]{32}\.part$/
  );
  assert.equal(mode(path.join(dir, name)), 0o600);
  // Names never come from outside, and nothing outside the pattern is read.
  assert.throws(() => spool.read('../escape.part'), AttachmentError);
  assert.throws(() => spool.create('../../x', 0), AttachmentError);

  // A symlink planted under a valid spool name is never followed.
  const target = path.join(root, 'elsewhere');
  fs.writeFileSync(target, 'secret');
  const planted = `${REPLY}.1.${'a'.repeat(32)}.part`;
  fs.symlinkSync(target, path.join(dir, planted));
  assert.throws(() => spool.read(planted));
  // A spool directory that is a symlink is refused outright.
  const linked = path.join(root, 'linked-spool');
  fs.symlinkSync(dir, linked);
  assert.throws(() => openSpool(linked), AttachmentError);
  // So is a spool whose parent directory is a symlink.
  const realParent = path.join(root, 'real-parent');
  fs.mkdirSync(realParent);
  const linkedParent = path.join(root, 'linked-parent');
  fs.symlinkSync(realParent, linkedParent);
  assert.throws(
    () => openSpool(path.join(linkedParent, 'attachment-spool')),
    AttachmentError
  );
});

test('downloads go only to the store origin, with the capability in a header and no redirects', async () => {
  const spool = openSpool(path.join(tempDir(), 'spool'));
  const file = manifestFile(1, bytes);
  const store = fakeStore(ORIGIN, new Map([[file.id, bytes]]));
  const name = await downloadObject({
    spool,
    origin: ORIGIN,
    replyId: REPLY,
    index: 0,
    file,
    capability: 'c'.repeat(64),
    fetchImpl: store.fetchImpl,
  });
  assert.deepEqual(spool.read(name), bytes);
  const [{ url, init }] = store.requests;
  assert.equal(new URL(url).origin, ORIGIN);
  assert.doesNotMatch(url, /c{64}/);
  assert.equal(init.headers.authorization, `MM-Fetch ${'c'.repeat(64)}`);
  assert.equal(init.redirect, 'error');

  // The store origin comes from the bridge socket: TLS, or loopback in tests.
  assert.equal(storeOrigin('wss://store.example/v1/bridge/connect'), ORIGIN);
  assert.throws(
    () => storeOrigin('ws://evil.example/v1/bridge/connect'),
    AttachmentError
  );
});

test('a redirect or an answer from another host is refused and nothing is kept', async () => {
  const dir = path.join(tempDir(), 'spool');
  const spool = openSpool(dir);
  const file = manifestFile(1, bytes);
  for (const respond of [
    () =>
      new Response(null, {
        status: 302,
        headers: { location: 'https://evil.example/x' },
      }),
    () => {
      const response = new Response(bytes, { status: 200 });
      Object.defineProperty(response, 'url', {
        value: 'https://evil.example/v1/bridge/attachments/fetch',
      });
      return response;
    },
    () => {
      const response = new Response(bytes, { status: 200 });
      Object.defineProperty(response, 'redirected', { value: true });
      return response;
    },
  ]) {
    const store = fakeStore(ORIGIN, new Map(), respond);
    assert.equal(
      await code(() =>
        downloadObject({
          spool,
          origin: ORIGIN,
          replyId: REPLY,
          index: 0,
          file,
          capability: 'c'.repeat(64),
          fetchImpl: store.fetchImpl,
        })
      ),
      'attachment_invalid'
    );
  }
  assert.deepEqual(spool.list(), []);
});

test('an oversize or altered object is cut off and removed', async () => {
  const spool = openSpool(path.join(tempDir(), 'spool'));
  const file = manifestFile(1, bytes);
  const longer = Buffer.concat([bytes, Buffer.from('!')]);
  const altered = Buffer.from(bytes);
  altered[0] ^= 1;
  for (const body of [longer, altered]) {
    const store = fakeStore(
      ORIGIN,
      new Map(),
      () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(body);
              controller.close();
            },
          }),
          { status: 200 }
        )
    );
    assert.equal(
      await code(() =>
        downloadObject({
          spool,
          origin: ORIGIN,
          replyId: REPLY,
          index: 0,
          file,
          capability: 'c'.repeat(64),
          fetchImpl: store.fetchImpl,
        })
      ),
      'attachment_invalid'
    );
  }
  assert.deepEqual(spool.list(), []);
});

test('reconcile removes settled and day-old orphan files but keeps pending ones', () => {
  const spool = openSpool(path.join(tempDir(), 'spool'));
  const make = (replyId) => {
    const { name, fd } = spool.create(replyId, 0);
    fs.closeSync(fd);
    return name;
  };
  const settled = make(uuid(1));
  const pending = make(uuid(2));
  const orphan = make(uuid(3));
  const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
  fs.utimesSync(path.join(spool.dir, orphan), old, old);
  fs.utimesSync(path.join(spool.dir, pending), old, old);
  const removed = spool.reconcile({
    settled: (id) => id === uuid(1),
    pending: (id) => id === uuid(2),
  });
  assert.equal(removed, 2);
  assert.deepEqual(spool.list(), [pending]);
  assert.ok(!spool.list().includes(settled));
});

test('spool writes loop over short writes and fail closed on a stalled one', () => {
  const bytes = Buffer.from('0123456789');
  const out = [];
  // At most three bytes per call, as a short write would.
  writeAll(7, bytes, (fd, buffer, offset, length) => {
    const n = Math.min(3, length);
    out.push(Buffer.from(buffer.subarray(offset, offset + n)));
    return n;
  });
  assert.deepEqual(Buffer.concat(out), bytes);
  assert.throws(() => writeAll(7, bytes, () => 0), AttachmentError);
  assert.throws(() => writeAll(7, bytes, () => -1), AttachmentError);
  assert.throws(
    () =>
      writeAll(7, bytes, () => {
        throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
      }),
    /disk full/
  );
});
