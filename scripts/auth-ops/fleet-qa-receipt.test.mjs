import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  stat,
  symlink,
  chmod,
  readFile,
  rm,
  realpath,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { receiptStore } from './fleet-qa.mjs';
import { newReceipt } from './fleet-qa.mjs';
import { syntheticCopy } from './fleet-qa-test-copy.mjs';
const config = { ack: 'D241_TEST_ACK', projectRef: 'abcdefghijklmnopqrst' };
test('0600 reservation, atomic update, strict reads, lock and no symlinks', async () => {
  const dir = await mkdtemp(join(await realpath(tmpdir()), 'd241-test-'));
  try {
    const path = join(dir, 'receipt');
    const store = await receiptStore(path, { custody: dir });
    try {
      await assert.rejects(receiptStore(path, { custody: dir }));
      const r = newReceipt(config, new Date('2026-11-16'));
      await store.reserve(r);
      assert.equal((await stat(path)).mode & 0o777, 0o600);
      await assert.rejects(store.reserve(r));
      await store.save(r);
      assert.deepEqual(await store.read(), r);
      assert.equal((await stat(path)).mode & 0o777, 0o600);
      assert.equal((await readFile(path, 'utf8')).includes('token'), false);
      await chmod(path, 0o644);
      await assert.rejects(store.read());
      await chmod(path, 0o600);
      const alias = join(dir, 'alias');
      await symlink(path, alias);
      const linked = await receiptStore(alias, { custody: dir });
      try {
        await assert.rejects(linked.read());
        await assert.rejects(linked.save(r));
      } finally {
        await linked.close();
      }
      const linkdir = join(dir, 'linkdir');
      await symlink(dir, linkdir);
      await assert.rejects(
        receiptStore(join(linkdir, 'receipt'), { custody: dir })
      );
    } finally {
      await store.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('local record commands preserve typed groups and refuse restricted QA surfaces', async () => {
  const copy = await syntheticCopy();
  const output = process.stdout.write;
  const captured = [];
  const path = join(copy.dir, 'receipt.json');
  try {
    const helper = await copy.import();
    const store = await helper.receiptStore(path, { custody: copy.dir });
    const r = helper.newReceipt(config, new Date('2026-11-16'));
    await store.reserve(r);
    await store.close();
    process.stdout.write = (value) => {
      captured.push(value);
      return true;
    };
    const { main } = await copy.importWrapper();
    await main([
      '--custody-directory',
      copy.dir,
      path,
      'record-workspace',
      'a1',
      '40000000-0000-4000-8000-000000000004',
    ]);
    await assert.rejects(
      main([
        '--custody-directory',
        copy.dir,
        path,
        'record-workspace',
        'a1',
        '40000000-0000-4000-8000-000000000004',
      ])
    );
    await main([
      '--custody-directory',
      copy.dir,
      path,
      'record-visit',
      'a1',
      'web:account-switch',
    ]);
    for (const surface of [
      'app:aurora:dashboard',
      'app:crawler:dashboard',
      'web:shortened-links',
      'web:time-tracking-export',
    ])
      await assert.rejects(
        main([
          '--custody-directory',
          copy.dir,
          path,
          'record-visit',
          'a1',
          surface,
        ])
      );
    const check = await helper.receiptStore(path, { custody: copy.dir });
    try {
      const data = await check.read();
      assert.equal(data.sharedRecords.length, 1);
      assert.equal(
        data.accounts.every((a) => a.workspaces.length === 0),
        true
      );
      assert.deepEqual(
        data.visitedSurfaces.map((v) => [v.label, v.surface]),
        [['a1', 'web:account-switch']]
      );
    } finally {
      await check.close();
    }
    assert.equal(captured.length, 2);
  } finally {
    process.stdout.write = output;
    await copy.close();
  }
});

test('receipt boundary refuses paths outside custody and non-owner-only descendants', async () => {
  const dir = await mkdtemp(
    join(await realpath(tmpdir()), 'd241-custody-test-')
  );
  try {
    await assert.rejects(
      receiptStore(join(dir, 'receipt'), { custody: join(dir, 'other') })
    );
    await chmod(dir, 0o750);
    await assert.rejects(receiptStore(join(dir, 'receipt'), { custody: dir }));
  } finally {
    await chmod(dir, 0o700);
    await rm(dir, { recursive: true, force: true });
  }
});

test('save refuses a revision changed after read and preserves the external receipt', async () => {
  const dir = await mkdtemp(
    join(await realpath(tmpdir()), 'd241-revision-test-')
  );
  const path = join(dir, 'receipt');
  const store = await receiptStore(path, { custody: dir });
  try {
    await store.reserve(newReceipt(config, new Date('2026-11-16')));
    const r = await store.read();
    const external = structuredClone(r);
    external.visitedSurfaces.push({
      label: 'a2',
      surface: 'web:logout',
      at: new Date().toISOString(),
    });
    await writeFile(path, JSON.stringify(external));
    await assert.rejects(store.save(r));
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), external);
  } finally {
    await store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
