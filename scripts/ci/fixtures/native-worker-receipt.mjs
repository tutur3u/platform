import { readNativeRuntimeConfig } from '../apps-native-runtime-pointer.mjs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { connect } from 'node:net';
import { join, basename } from 'node:path';

export async function recordNativeWorker(worker, app) {
  const directory = process.env.NATIVE_RUNTIME_RECEIPT_DIR;
  if (!directory) return;
  const hashes = {};
  for (const file of await readdir(join(app, 'dist'), {
    recursive: true,
    withFileTypes: true,
  })) {
    if (file.isFile()) {
      const path = join(file.parentPath, file.name);
      hashes[path.slice(app.length + 1)] = createHash('sha256')
        .update(await readFile(path))
        .digest('hex');
    }
  }
  const rows = execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,comm='], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .map((line) => {
      const [, pid, parent, executable] =
        line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/u) ?? [];
      return { pid: Number(pid), parent: Number(parent), executable };
    });
  const owned = new Set([process.pid]);
  for (let size = 0; size !== owned.size;) {
    size = owned.size;
    for (const row of rows) if (owned.has(row.parent)) owned.add(row.pid);
  }
  const processes = [];
  for (const row of rows.filter((row) => owned.has(row.pid))) {
    let executableHash;
    try {
      executableHash = createHash('sha256')
        .update(await readFile(row.executable))
        .digest('hex');
    } catch {
      /* The process may exit between observations. */
    }
    processes.push({ ...row, executableHash });
  }
  const source = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: app,
    encoding: 'utf8',
  }).trim();
  const tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], {
    cwd: app,
    encoding: 'utf8',
  }).trim();
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, `${basename(app)}-${process.pid}-${Date.now()}.json`),
    JSON.stringify(
      {
        source,
        tree,
        profile: readNativeRuntimeConfig(app).config,
        node: process.execPath,
        nodeVersion: process.version,
        url: String(await worker.url),
        processes,
        hashes,
      },
      null,
      2
    )
  );
}

export async function disposeNativeWorker(worker) {
  const address = await worker.url;
  await worker.dispose();
  await new Promise((resolve, reject) => {
    const socket = connect({
      host: address.hostname,
      port: Number(address.port),
    });
    socket.setTimeout(1000, () => {
      socket.destroy();
      reject(new Error('Listener drain UNKNOWN'));
    });
    socket.once('connect', () => {
      socket.destroy();
      reject(new Error('Owned listener still serves'));
    });
    socket.once('error', (error) => {
      try {
        assert.equal(error.code, 'ECONNREFUSED');
        resolve();
      } catch (failure) {
        reject(failure);
      }
    });
  });
}

export function offlineEgressFence(egress = [], status = 401, budget = 16) {
  return (request) => {
    assert.ok(egress.length < budget, 'Fixture egress operation budget');
    egress.push(new URL(request.url).origin);
    return new Response('{"error":"fixture egress denied"}', {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
}
